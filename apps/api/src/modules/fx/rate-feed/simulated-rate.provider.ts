import { Injectable } from '@nestjs/common';

import { RATE_SCALE, type CurrencyCode, type ExchangeRate } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppConfigService } from '../../../config/config.service.js';

import { anchorFor, isQuotable, PIVOT_CURRENCY, QUOTABLE_CURRENCIES } from './base-rates.js';
import { advance, changeBps, seedFor, type WalkState } from './random-walk.js';
import { RateProviderPort, type MidQuote } from './rate-provider.port.js';

/** How often the tape moves, in milliseconds. */
const TICK_MS = 15_000;

/** Milliseconds in a session. The tape runs one session per UTC day. */
const SESSION_MS = 86_400_000;

/** Ticks in a session. The walk's position is an offset inside this range. */
const TICKS_PER_SESSION = SESSION_MS / TICK_MS;

/** Length of an ISO date, used to detect a session boundary. */
const ISO_DATE_LENGTH = 10;

/** One currency's walk against sterling, at a known point in the session. */
interface Leg {
  walk: WalkState;
  /** Ticks into the session the walk has been advanced to. */
  position: number;
  /** The session the position belongs to, as `YYYY-MM-DD`. */
  session: string;
}

/**
 * A simulated market that behaves like one.
 *
 * **Every rate is a function of the seed and the instant, and of nothing else.** The tape
 * opens each UTC session at its published reference level and walks from there, so a rate
 * is fully determined by the date, the time of day and the configured seed. Restarting the
 * process, replaying a scenario or running the same test on another machine produces the
 * same market — which is what makes a bug that only appears when EUR/GBP crosses 1.17
 * reproducible by date rather than by luck.
 *
 * Opening each session at the reference level is a deliberate simplification, and an honest
 * one: it is how a daily fixing behaves, it makes "change since the open" exactly
 * computable rather than approximated from a stored snapshot, and it bounds the work of a
 * cold read to one session's worth of ticks however long the process has been asleep.
 *
 * **Every cross is derived from two sterling legs.** EUR/JPY is arithmetically consistent
 * with EUR/GBP and GBP/JPY at all times — a market where the three disagree is one an
 * arbitrageur could take the bank apart in.
 */
@Injectable()
export class SimulatedRateProvider extends RateProviderPort {
  private readonly legs = new Map<CurrencyCode, Leg>();
  private readonly seedPhrase: string;
  /** Signed bps shifts added on top of the walk, keyed by `"FROM/TO"`. */
  private readonly nudges = new Map<string, number>();

  constructor(
    private readonly clock: ClockService,
    config: AppConfigService,
  ) {
    super();
    this.seedPhrase = config.simulation.seed;
  }

  /**
   * Applies a one-time basis-point shift on a specific pair.
   *
   * Positive values strengthen the base currency, negative values weaken it. The nudge
   * persists until the next `resetNudges()` — it is intended for the operations console's
   * "move rate" command, not for sustained manipulation.
   */
  nudge(from: CurrencyCode, to: CurrencyCode, bps: number): void {
    const key = `${from}/${to}`;
    this.nudges.set(key, (this.nudges.get(key) ?? 0) + bps);
  }

  /** Clears all pending nudges, reverting to the random-walk baseline. */
  resetNudges(): void {
    this.nudges.clear();
  }

  override async midFor(from: CurrencyCode, to: CurrencyCode): Promise<MidQuote | null> {
    if (!isQuotable(from) || !isQuotable(to)) return null;

    const asOf = this.clock.now();
    const source = this.legAt(from, asOf);
    const target = this.legAt(to, asOf);

    const base = cross(from, to, source.walk.value, target.walk.value);
    const nudgeBps = this.nudges.get(`${from}/${to}`) ?? 0;
    const rate = nudgeBps === 0 ? base : applyNudge(base, nudgeBps);

    return {
      rate,
      changeBps: changeBps(
        crossValue(anchorFor(from).value, anchorFor(to).value),
        crossValue(source.walk.value, target.walk.value),
      ),
      asOf,
    };
  }

  override async board(base: CurrencyCode): Promise<readonly MidQuote[]> {
    if (!isQuotable(base)) return [];

    const quotes: MidQuote[] = [];
    for (const code of QUOTABLE_CURRENCIES) {
      if (code === base) continue;
      const quote = await this.midFor(base, code);
      if (quote) quotes.push(quote);
    }

    return quotes;
  }

  /**
   * The leg for a currency, walked to the point in the session the clock is at.
   *
   * The pivot does not walk. Every anchor is quoted as units per one pound, so sterling's
   * own leg is one by definition — and holding it exactly at one is what makes a cross
   * derived from two legs identical to the same cross computed from the two published
   * sterling rates. A pivot that drifted would introduce a second rounding step and let the
   * three quotes disagree by a minor unit.
   */
  private legAt(code: CurrencyCode, asOf: Date): Leg {
    const session = asOf.toISOString().slice(0, ISO_DATE_LENGTH);
    if (code === PIVOT_CURRENCY) return this.openLeg(code, session);

    const position = Math.min(
      Math.floor((asOf.getTime() % SESSION_MS) / TICK_MS),
      TICKS_PER_SESSION,
    );

    const held = this.legs.get(code);
    const leg =
      held && held.session === session && held.position <= position
        ? held
        : this.openLeg(code, session);

    if (position > leg.position) {
      leg.walk = advance(leg.walk, anchorFor(code).value, position - leg.position);
      leg.position = position;
    }

    this.legs.set(code, leg);
    return leg;
  }

  /** The start of a session: the currency sits at its published reference level. */
  private openLeg(code: CurrencyCode, session: string): Leg {
    return {
      walk: {
        value: anchorFor(code).value,
        seed: seedFor(this.seedPhrase, `${PIVOT_CURRENCY}${code}`),
      },
      position: 0,
      session,
    };
  }
}

/** `to` per one `from`, derived from the two sterling legs. */
function crossValue(fromLevel: bigint, toLevel: bigint): bigint {
  if (fromLevel === 0n) return 0n;
  return (toLevel * 10n ** BigInt(RATE_SCALE)) / fromLevel;
}

function cross(
  from: CurrencyCode,
  to: CurrencyCode,
  fromLevel: bigint,
  toLevel: bigint,
): ExchangeRate {
  return { from, to, value: crossValue(fromLevel, toLevel), scale: RATE_SCALE };
}

/** Applies a signed basis-point shift to an exchange rate. */
function applyNudge(rate: ExchangeRate, bps: number): ExchangeRate {
  // bps are parts per 10,000; apply as a multiplicative factor.
  const factor = BPS_SCALE + BigInt(bps);
  const adjusted = (rate.value * factor) / BPS_SCALE;
  return { ...rate, value: adjusted };
}

const BPS_SCALE = 10_000n;
