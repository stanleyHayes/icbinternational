import { RATE_SCALE } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { type AppConfigService } from '../../../config/config.service.js';
import { anchorFor, isQuotable, QUOTABLE_CURRENCIES } from '../rate-feed/base-rates.js';
import { advance, changeBps, nextRandom, seedFor, step } from '../rate-feed/random-walk.js';
import { SimulatedRateProvider } from '../rate-feed/simulated-rate.provider.js';

const SEED_PHRASE = 'reliance';

/** A config stub carrying only the seed the feed reads. */
function configWith(seed: string): AppConfigService {
  return { simulation: { seed } } as unknown as AppConfigService;
}

/** A clock pinned to a known instant, so a test names the tick it is asserting on. */
function clockAt(iso: string): ClockService {
  const clock = new ClockService();
  clock.freezeAt(new Date(iso));
  return clock;
}

describe('the random walk', () => {
  it('replays exactly from the same seed', () => {
    const anchor = anchorFor('EUR').value;
    const start = { value: anchor, seed: seedFor(SEED_PHRASE, 'GBPEUR') };

    expect(advance(start, anchor, 100)).toStrictEqual(advance(start, anchor, 100));
  });

  it('gives two currencies different paths from one seed phrase', () => {
    expect(seedFor(SEED_PHRASE, 'GBPEUR')).not.toBe(seedFor(SEED_PHRASE, 'GBPUSD'));
  });

  it('moves, rather than sitting on its anchor', () => {
    const anchor = anchorFor('USD').value;
    const walked = advance({ value: anchor, seed: seedFor(SEED_PHRASE, 'GBPUSD') }, anchor, 200);

    expect(walked.value).not.toBe(anchor);
  });

  it('stays inside a plausible band however long it runs', () => {
    const anchor = anchorFor('ZAR').value;
    const walked = advance({ value: anchor, seed: seedFor(SEED_PHRASE, 'GBPZAR') }, anchor, 5000);

    expect(walked.value).toBeGreaterThan((anchor * 85n) / 100n);
    expect(walked.value).toBeLessThan((anchor * 115n) / 100n);
  });

  it('keeps the generator inside 32 unsigned bits', () => {
    let state = seedFor(SEED_PHRASE, 'GBPJPY');

    for (let index = 0; index < 1000; index += 1) {
      state = nextRandom(state).seed;
      expect(state).toBeGreaterThanOrEqual(0);
      expect(state).toBeLessThan(2 ** 32);
    }
  });

  it('never steps to zero or below', () => {
    const anchor = anchorFor('KWD').value;
    let state = { value: anchor, seed: seedFor(SEED_PHRASE, 'GBPKWD') };

    for (let index = 0; index < 500; index += 1) {
      state = step(state, anchor);
      expect(state.value).toBeGreaterThan(0n);
    }
  });

  it('measures change against the open in basis points, signed', () => {
    expect(changeBps(10_000n, 10_100n)).toBe(100);
    expect(changeBps(10_000n, 9_900n)).toBe(-100);
    expect(changeBps(0n, 1n)).toBe(0);
  });
});

describe('the sterling anchors', () => {
  it('has one for every currency it claims to quote', () => {
    for (const code of QUOTABLE_CURRENCIES) {
      expect(anchorFor(code).scale).toBe(RATE_SCALE);
    }
  });

  it('refuses a currency it does not quote', () => {
    expect(isQuotable('XXX')).toBe(false);
  });
});

describe('SimulatedRateProvider', () => {
  const provider = (iso = '2026-03-02T09:00:00.000Z') =>
    new SimulatedRateProvider(clockAt(iso), configWith(SEED_PHRASE));

  it('produces the same market for the same seed and instant', async () => {
    const left = await provider().midFor('GBP', 'EUR');
    const right = await provider().midFor('GBP', 'EUR');

    expect(right?.rate.value).toBe(left?.rate.value);
  });

  it('produces a different market for a different seed', async () => {
    const other = new SimulatedRateProvider(
      clockAt('2026-03-02T09:00:00.000Z'),
      configWith('a-different-tape'),
    );

    const base = await provider().midFor('GBP', 'ZAR');
    const alternative = await other.midFor('GBP', 'ZAR');

    expect(alternative?.rate.value).not.toBe(base?.rate.value);
  });

  it('derives a cross that agrees with its two sterling legs', async () => {
    const feed = provider();
    const eur = await feed.midFor('GBP', 'EUR');
    const jpy = await feed.midFor('GBP', 'JPY');
    const cross = await feed.midFor('EUR', 'JPY');

    const derived = ((jpy?.rate.value ?? 0n) * 10n ** BigInt(RATE_SCALE)) / (eur?.rate.value ?? 1n);

    expect(cross?.rate.value).toBe(derived);
  });

  it('inverts a pair consistently', async () => {
    const feed = provider();
    const forward = await feed.midFor('GBP', 'USD');
    const backward = await feed.midFor('USD', 'GBP');

    const unit = 10n ** BigInt(RATE_SCALE);
    const round = ((forward?.rate.value ?? 0n) * (backward?.rate.value ?? 0n)) / unit;

    expect(round).toBeGreaterThan((unit * 99n) / 100n);
    expect(round).toBeLessThan((unit * 101n) / 100n);
  });

  it('refuses a pair it does not quote', async () => {
    expect(await provider().midFor('GBP', 'XXX' as 'USD')).toBeNull();
  });

  it('publishes a board of every other currency against the base', async () => {
    const board = await provider().board('GBP');

    expect(board).toHaveLength(QUOTABLE_CURRENCIES.length - 1);
    expect(board.every((quote) => quote.rate.from === 'GBP')).toBe(true);
  });

  it('moves the market as the clock moves', async () => {
    const morning = await provider('2026-03-02T09:00:00.000Z').midFor('GBP', 'EUR');
    const evening = await provider('2026-03-02T18:00:00.000Z').midFor('GBP', 'EUR');

    expect(evening?.rate.value).not.toBe(morning?.rate.value);
  });
});
