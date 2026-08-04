import { AccountStatus } from '@reliance/contracts';
import { Money, rateFromDecimalString, type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../../common/clock/clock.service.js';
import { toStored } from '../../../common/money/money.codec.js';
import { type AccountRecord, type AccountStore } from '../../accounts/index.js';
import { type UsersService } from '../../auth/users/index.js';
import { RateProviderPort, type MidQuote } from '../../fx/index.js';
import { isFullyPriced, toContractNetWorth } from '../wallet.mapper.js';
import { WalletService } from '../wallet.service.js';

const USER = 'usr_01JQ8Z0000000000000000000A';

/** Anchors for the two pairs these tests price, plus a pair the bank cannot quote. */
const MIDS: Readonly<Record<string, string>> = { EURGBP: '0.8558', USDGBP: '0.7849' };

class PinnedRates extends RateProviderPort {
  override async midFor(from: CurrencyCode, to: CurrencyCode): Promise<MidQuote | null> {
    const decimal = MIDS[`${from}${to}`];
    if (!decimal) return null;

    return {
      rate: rateFromDecimalString(from, to, decimal),
      changeBps: 0,
      asOf: new Date('2026-03-02T09:00:00.000Z'),
    };
  }

  override async board(): Promise<readonly MidQuote[]> {
    return [];
  }
}

function accountOf(
  id: string,
  currency: CurrencyCode,
  major: string,
  overrides: Partial<AccountRecord> = {},
): AccountRecord {
  const balance = toStored(Money.fromMajor(major, currency));

  return {
    id,
    userId: USER,
    currency,
    status: AccountStatus.ACTIVE,
    productName: `${currency} Wallet`,
    nickname: null,
    ledgerBalance: balance,
    availableBalance: balance,
    ...overrides,
  } as unknown as AccountRecord;
}

function rig(accounts: readonly AccountRecord[], baseCurrency = 'GBP') {
  const store = {
    async listByUser(): Promise<readonly AccountRecord[]> {
      return accounts;
    },
  } as unknown as AccountStore;

  const users = {
    async requireById(): Promise<{ baseCurrency: string }> {
      return { baseCurrency };
    },
  } as unknown as UsersService;

  const clock = new ClockService();
  clock.freezeAt(new Date('2026-03-02T09:00:00.000Z'));

  return new WalletService(store, new PinnedRates(), users, clock);
}

describe('wallet positions', () => {
  it('reports each wallet at its own exact balance', async () => {
    const service = rig([
      accountOf('acc_1', 'GBP', '1,200.00'),
      accountOf('acc_2', 'EUR', '450.00'),
    ]);

    const positions = await service.positions(USER);

    expect(positions.map((position) => position.ledger.toMajorString())).toStrictEqual([
      '1200.00',
      '450.00',
    ]);
  });

  it('values a foreign wallet at mid, and says which rate it used', async () => {
    const service = rig([accountOf('acc_2', 'EUR', '450.00')]);
    const [position] = await service.positions(USER);

    expect(position?.baseEquivalent?.currency).toBe('GBP');
    expect(position?.baseEquivalent?.toMajorString()).toBe('385.11');
    expect(position?.rate).toBe('0.85580000');
  });

  it('leaves the base-currency wallet unconverted', async () => {
    const service = rig([accountOf('acc_1', 'GBP', '1,200.00')]);
    const [position] = await service.positions(USER);

    expect(position?.rate).toBeNull();
    expect(position?.baseEquivalent?.toMajorString()).toBe('1200.00');
  });

  it('shows a wallet it cannot price rather than dropping it', async () => {
    const service = rig([accountOf('acc_3', 'JPY', '90000')]);
    const [position] = await service.positions(USER);

    expect(position?.ledger.toMajorString()).toBe('90000');
    expect(position?.baseEquivalent).toBeNull();
  });

  it('leaves a closed account out entirely', async () => {
    const service = rig([
      accountOf('acc_1', 'GBP', '1,200.00'),
      accountOf('acc_4', 'GBP', '0.00', { status: AccountStatus.CLOSED }),
    ]);

    expect(await service.positions(USER)).toHaveLength(1);
  });

  it('prefers the customer’s own label for the wallet', async () => {
    const service = rig([accountOf('acc_1', 'GBP', '10.00', { nickname: 'Rainy day' })]);
    const [position] = await service.positions(USER);

    expect(position?.name).toBe('Rainy day');
  });
});

describe('the consolidated position', () => {
  it('adds up the wallets it can price', async () => {
    const service = rig([
      accountOf('acc_1', 'GBP', '1,200.00'),
      accountOf('acc_2', 'EUR', '450.00'),
    ]);

    const overview = await service.overview(USER);

    expect(overview.totalAssets.toMajorString()).toBe('1585.11');
    expect(overview.net.toMajorString()).toBe('1585.11');
    expect(overview.unpriced).toStrictEqual([]);
  });

  it('treats an overdrawn wallet as a liability, not a smaller asset', async () => {
    const service = rig([
      accountOf('acc_1', 'GBP', '1,200.00'),
      accountOf('acc_5', 'GBP', '-200.00'),
    ]);

    const overview = await service.overview(USER);

    expect(overview.totalAssets.toMajorString()).toBe('1200.00');
    expect(overview.totalLiabilities.toMajorString()).toBe('200.00');
    expect(overview.net.toMajorString()).toBe('1000.00');
  });

  it('names the currencies the total had to leave out', async () => {
    const service = rig([
      accountOf('acc_1', 'GBP', '1,200.00'),
      accountOf('acc_3', 'JPY', '90000'),
    ]);

    const overview = await service.overview(USER);

    expect(overview.unpriced).toStrictEqual(['JPY']);
    expect(isFullyPriced(overview)).toBe(false);
    expect(overview.net.toMajorString()).toBe('1200.00');
  });

  it('totals per currency exactly, because no rate is involved', async () => {
    const service = rig([
      accountOf('acc_1', 'GBP', '1,200.00'),
      accountOf('acc_6', 'GBP', '300.00'),
      accountOf('acc_2', 'EUR', '450.00'),
    ]);

    const overview = await service.overview(USER);

    expect(
      overview.byCurrency.map((entry) => [entry.currency, entry.total.toMajorString()]),
    ).toStrictEqual([
      ['GBP', '1500.00'],
      ['EUR', '450.00'],
    ]);
  });

  it('projects onto the contract shape the accounts lane already publishes', async () => {
    const service = rig([accountOf('acc_1', 'GBP', '1,200.00')]);
    const wire = toContractNetWorth(await service.overview(USER));

    expect(wire.baseCurrency).toBe('GBP');
    expect(wire.net).toStrictEqual({ amount: '120000', currency: 'GBP' });
    expect(wire.asOf).toBe('2026-03-02T09:00:00.000Z');
  });
});
