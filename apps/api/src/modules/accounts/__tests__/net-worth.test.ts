import { AccountStatus, ErrorCode } from '@reliance/contracts';
import {
  Money,
  rateFromDecimalString,
  type CurrencyCode,
  type ExchangeRate,
} from '@reliance/money';

import { type UsersService } from '../../auth/users/index.js';
import { ExchangeRatePort, IdentityExchangeRatePort } from '../exchange-rate.port.js';
import { InMemoryAccountStore } from '../in-memory-account.store.js';
import { NetWorthService } from '../net-worth.service.js';

import { frozenClock, gbp, seedAccount, TEST_USER } from './accounts-harness.js';

/** A rate source that knows one pair, standing in for the FX module that will bind it. */
class FixedRatePort extends ExchangeRatePort {
  override async rateFor(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate | null> {
    if (from === to) return rateFromDecimalString(from, to, '1');
    if (from === 'USD' && to === 'GBP') return rateFromDecimalString(from, to, '0.80');
    return null;
  }
}

function rig(rates: ExchangeRatePort = new IdentityExchangeRatePort()) {
  const accounts = new InMemoryAccountStore();
  const users = {
    requireById: async (id: string) => ({ id, baseCurrency: 'GBP' }),
  } as unknown as UsersService;

  return { accounts, service: new NetWorthService(accounts, rates, users, frozenClock()) };
}

describe('net worth', () => {
  it('is zero for a customer with no accounts', async () => {
    const { service } = rig();

    const worth = await service.forUser(TEST_USER);

    expect(worth.net.amount).toBe('0');
    expect(worth.byCurrency).toEqual([]);
  });

  it('sums balances in the base currency', async () => {
    const { accounts, service } = rig();
    await seedAccount(accounts, { ledger: gbp('120000') });
    await seedAccount(accounts, { ledger: gbp('35000'), isPrimary: false });

    const worth = await service.forUser(TEST_USER);

    expect(worth.totalAssets.amount).toBe('155000');
    expect(worth.totalLiabilities.amount).toBe('0');
    expect(worth.net.amount).toBe('155000');
  });

  it('counts an overdrawn account as a liability rather than netting it away silently', async () => {
    const { accounts, service } = rig();
    await seedAccount(accounts, { ledger: gbp('120000') });
    await seedAccount(accounts, {
      ledger: gbp('-20000'),
      overdraft: gbp('50000'),
      isPrimary: false,
    });

    const worth = await service.forUser(TEST_USER);

    expect(worth.totalAssets.amount).toBe('120000');
    expect(worth.totalLiabilities.amount).toBe('20000');
    expect(worth.net.amount).toBe('100000');
  });

  it('ignores holds and overdraft headroom — this is what is owned, not what is spendable', async () => {
    const { accounts, service } = rig();
    await seedAccount(accounts, {
      ledger: gbp('120000'),
      held: gbp('45000'),
      overdraft: gbp('50000'),
    });

    const worth = await service.forUser(TEST_USER);

    expect(worth.net.amount).toBe('120000');
  });

  it('excludes closed accounts', async () => {
    const { accounts, service } = rig();
    await seedAccount(accounts, { ledger: gbp('120000') });
    await seedAccount(accounts, {
      ledger: gbp('999999'),
      status: AccountStatus.CLOSED,
      isPrimary: false,
    });

    const worth = await service.forUser(TEST_USER);

    expect(worth.net.amount).toBe('120000');
    expect(worth.byCurrency).toHaveLength(1);
  });

  it('breaks the position down by currency without converting', async () => {
    const { accounts, service } = rig(new FixedRatePort());
    await seedAccount(accounts, { ledger: gbp('120000') });
    await seedAccount(accounts, { currency: 'USD', isPrimary: false });

    const worth = await service.forUser(TEST_USER);

    expect(worth.byCurrency).toEqual([
      { currency: 'GBP', total: { amount: '120000', currency: 'GBP' } },
      { currency: 'USD', total: { amount: '0', currency: 'USD' } },
    ]);
  });

  it('converts a foreign wallet at the supplied rate', async () => {
    const { accounts, service } = rig(new FixedRatePort());
    await seedAccount(accounts, { ledger: gbp('120000') });
    await seedAccount(accounts, {
      currency: 'USD',
      isPrimary: false,
      ledger: Money.fromMinor('50000', 'USD'),
    });

    const worth = await service.forUser(TEST_USER);

    // $500.00 at 0.80 is £400.00, on top of the £1,200.00 already held.
    expect(worth.totalAssets.amount).toBe('160000');
  });

  /**
   * The honest failure. A total that quietly omits an unpriceable wallet is a wrong
   * number wearing a right one's clothes, so the whole answer is refused instead.
   */
  it('refuses to answer at all when a currency cannot be priced', async () => {
    const { accounts, service } = rig();
    await seedAccount(accounts, { ledger: gbp('120000') });
    await seedAccount(accounts, { currency: 'USD', isPrimary: false });

    await expect(service.forUser(TEST_USER)).rejects.toMatchObject({
      code: ErrorCode.RATE_UNAVAILABLE,
    });
  });
});
