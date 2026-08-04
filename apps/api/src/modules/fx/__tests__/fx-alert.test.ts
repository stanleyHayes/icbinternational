import { ErrorCode } from '@reliance/contracts';
import { rateFromDecimalString, type CurrencyCode } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { FxAlertService, hasCrossed, toContractAlert } from '../fx-alert.service.js';
import { type FxAlertRecord } from '../fx-alert.store.js';
import { InMemoryFxAlertStore } from '../in-memory-fx-alert.store.js';
import { RateAlertNotifierPort, type RateAlertNotice } from '../rate-alert-notifier.port.js';
import { RateProviderPort, type MidQuote } from '../rate-feed/rate-provider.port.js';

import { frozenClock } from './fx-harness.js';

const USER = 'usr_01JQ8Z0000000000000000000A';

/** A feed pinned to one level, so a crossing is asserted rather than waited for. */
class PinnedRateProvider extends RateProviderPort {
  constructor(
    private level: string,
    private readonly at: Date,
  ) {
    super();
  }

  moveTo(level: string): void {
    this.level = level;
  }

  override async midFor(from: CurrencyCode, to: CurrencyCode): Promise<MidQuote | null> {
    return { rate: rateFromDecimalString(from, to, this.level), changeBps: 0, asOf: this.at };
  }

  override async board(): Promise<readonly MidQuote[]> {
    return [];
  }
}

/** A notifier that counts what it was asked to send. */
class CountingNotifier extends RateAlertNotifierPort {
  readonly sent: RateAlertNotice[] = [];

  override async notify(notice: RateAlertNotice): Promise<void> {
    this.sent.push(notice);
  }
}

function rig(level = '1.1600') {
  const clock = frozenClock();
  const alerts = new InMemoryFxAlertStore(new IdGenerator());
  const rates = new PinnedRateProvider(level, clock.now());
  const notifier = new CountingNotifier();
  const service = new FxAlertService(alerts, rates, notifier, clock);

  return { clock, alerts, rates, notifier, service };
}

const alertFor = (overrides: Partial<FxAlertRecord> = {}): FxAlertRecord =>
  ({
    id: 'alt_1',
    userId: USER,
    from: 'GBP',
    to: 'EUR',
    direction: 'ABOVE',
    targetRate: '1.1700',
    active: true,
    triggeredAt: null,
    createdAt: new Date(0),
    ...overrides,
  }) as FxAlertRecord;

describe('crossing a level', () => {
  const target = rateFromDecimalString('GBP', 'EUR', '1.1700').value;

  it('fires an ABOVE alert at or beyond the target', () => {
    expect(hasCrossed(alertFor(), target)).toBe(true);
    expect(hasCrossed(alertFor(), target + 1n)).toBe(true);
    expect(hasCrossed(alertFor(), target - 1n)).toBe(false);
  });

  it('fires a BELOW alert at or beneath the target', () => {
    const below = alertFor({ direction: 'BELOW' });

    expect(hasCrossed(below, target)).toBe(true);
    expect(hasCrossed(below, target - 1n)).toBe(true);
    expect(hasCrossed(below, target + 1n)).toBe(false);
  });
});

describe('arming an alert', () => {
  it('stores the target as the customer typed it, not as a float', async () => {
    const { service } = rig();

    const alert = await service.create(USER, {
      from: 'GBP',
      to: 'EUR',
      direction: 'ABOVE',
      targetRate: '1.1700',
    });

    expect(alert.targetRate).toBe('1.1700');
    expect(alert.active).toBe(true);
    expect(alert.triggeredAt).toBeNull();
  });

  it('refuses to watch a pair the bank does not quote', async () => {
    const { service, rates } = rig();
    jest.spyOn(rates, 'midFor').mockResolvedValue(null);

    await expect(
      service.create(USER, { from: 'GBP', to: 'EUR', direction: 'ABOVE', targetRate: '1.17' }),
    ).rejects.toMatchObject({ code: ErrorCode.RATE_UNAVAILABLE });
  });

  it('caps how many rates one customer may watch', async () => {
    const { service } = rig();
    const request = {
      from: 'GBP' as const,
      to: 'EUR' as const,
      direction: 'ABOVE' as const,
      targetRate: '1.17',
    };

    for (let index = 0; index < 25; index += 1) await service.create(USER, request);

    await expect(service.create(USER, request)).rejects.toMatchObject({
      code: ErrorCode.LIMIT_EXCEEDED,
    });
  });
});

describe('the evaluation sweep', () => {
  const request = {
    from: 'GBP' as const,
    to: 'EUR' as const,
    direction: 'ABOVE' as const,
    targetRate: '1.1700',
  };

  it('leaves an alert armed while the level is unreached', async () => {
    const { service, notifier } = rig('1.1600');
    await service.create(USER, request);

    expect(await service.evaluate()).toStrictEqual({ examined: 1, triggered: 0 });
    expect(notifier.sent).toHaveLength(0);
  });

  it('fires once the level is reached, and tells the customer what it reached', async () => {
    const { service, notifier, rates } = rig('1.1600');
    await service.create(USER, request);

    rates.moveTo('1.1725');
    expect(await service.evaluate()).toStrictEqual({ examined: 1, triggered: 1 });
    expect(notifier.sent[0]?.rate).toBe('1.17250000');
  });

  it('fires once, and not again while the level holds', async () => {
    const { service, notifier, rates } = rig('1.1600');
    await service.create(USER, request);
    rates.moveTo('1.1725');

    await service.evaluate();
    await service.evaluate();

    expect(notifier.sent).toHaveLength(1);
  });

  it('disarms the alert and stamps when it fired', async () => {
    const { service, rates, clock } = rig('1.1600');
    const armed = await service.create(USER, request);
    rates.moveTo('1.1725');

    await service.evaluate();
    const fired = await service.get(USER, armed.id);

    expect(fired.active).toBe(false);
    expect(fired.triggeredAt?.toISOString()).toBe(clock.now().toISOString());
  });
});

describe('managing alerts', () => {
  it("refuses to show one customer another customer's alert", async () => {
    const { service } = rig();
    const alert = await service.create(USER, {
      from: 'GBP',
      to: 'EUR',
      direction: 'ABOVE',
      targetRate: '1.17',
    });

    await expect(service.get('usr_01JQ8Z0000000000000000000Z', alert.id)).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('removes an alert the customer no longer wants', async () => {
    const { service } = rig();
    const alert = await service.create(USER, {
      from: 'GBP',
      to: 'EUR',
      direction: 'BELOW',
      targetRate: '1.10',
    });

    await service.remove(USER, alert.id);
    expect(await service.list(USER)).toHaveLength(0);
  });

  it('projects onto the wire without leaking the owner', () => {
    const wire = toContractAlert(alertFor());

    expect(wire).not.toHaveProperty('userId');
    expect(wire.targetRate).toBe('1.1700');
  });
});
