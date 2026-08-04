import { AccountStatus, ErrorCode } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { toStored } from '../../../common/money/money.codec.js';
import { BalanceWriteConflictError } from '../concurrency.js';
import { InMemoryAccountStore } from '../in-memory-account.store.js';
import { MongoAccountBalancePort } from '../mongo-account-balance.port.js';

import { frozenClock, gbp, seedAccount, TEST_SESSION } from './accounts-harness.js';

function rig() {
  const accounts = new InMemoryAccountStore();
  return { accounts, port: new MongoAccountBalancePort(accounts, frozenClock()) };
}

describe('applyDelta', () => {
  it('moves the ledger and the stored available balance by the same signed amount', async () => {
    const { accounts, port } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp('10000') });

    await port.applyDelta({ accountId, delta: gbp('-2500'), session: TEST_SESSION });

    const account = await accounts.findById(accountId);
    expect(account?.ledgerBalance).toEqual(toStored(gbp('7500')));
    expect(account?.availableBalance).toEqual(toStored(gbp('7500')));
  });

  it('leaves holds untouched, so a posting cannot free somebody else’s reserve', async () => {
    const { accounts, port } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp('10000'), held: gbp('3000') });

    await port.applyDelta({ accountId, delta: gbp('1000'), session: TEST_SESSION });

    const account = await accounts.findById(accountId);
    expect(account?.holdTotal).toEqual(toStored(gbp('3000')));
    expect(account?.availableBalance).toEqual(toStored(gbp('8000')));
  });

  it('activates a pending account once the opening minimum is met', async () => {
    const { accounts, port } = rig();
    const accountId = await seedAccount(accounts, {
      status: AccountStatus.PENDING,
      minimumOpeningBalance: toStored(gbp('10000')),
    });

    await port.applyDelta({ accountId, delta: gbp('9999'), session: TEST_SESSION });
    expect((await accounts.findById(accountId))?.status).toBe(AccountStatus.PENDING);

    await port.applyDelta({ accountId, delta: gbp('1'), session: TEST_SESSION });
    expect((await accounts.findById(accountId))?.status).toBe(AccountStatus.ACTIVE);
  });

  it('wakes a dormant account and clears its dormancy stamp', async () => {
    const { accounts, port } = rig();
    const accountId = await seedAccount(accounts);
    await accounts.patch({
      accountId,
      fields: { status: AccountStatus.DORMANT, dormantAt: new Date('2026-01-01T00:00:00.000Z') },
    });

    await port.applyDelta({ accountId, delta: gbp('100'), session: TEST_SESSION });

    const account = await accounts.findById(accountId);
    expect(account?.status).toBe(AccountStatus.ACTIVE);
    expect(account?.dormantAt).toBeNull();
  });

  it('refuses a posting in the wrong currency with the contract code', async () => {
    const { accounts, port } = rig();
    const accountId = await seedAccount(accounts);

    await expect(
      port.applyDelta({
        accountId,
        delta: Money.fromMinor('100', 'USD'),
        session: TEST_SESSION,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.CURRENCY_MISMATCH });
  });

  it('raises a retryable conflict when the account moved under it', async () => {
    const { accounts, port } = rig();
    const accountId = await seedAccount(accounts);

    // Simulate the write losing its optimistic-concurrency race.
    jest.spyOn(accounts, 'writeBalances').mockResolvedValueOnce(false);

    await expect(
      port.applyDelta({ accountId, delta: gbp('100'), session: TEST_SESSION }),
    ).rejects.toBeInstanceOf(BalanceWriteConflictError);
  });

  it('labels that conflict so the transaction runner retries it', async () => {
    const error = new BalanceWriteConflictError('acc_test');
    expect(error.errorLabels).toContain('TransientTransactionError');
  });
});

describe('assertPostable', () => {
  it.each([[AccountStatus.ACTIVE], [AccountStatus.PENDING], [AccountStatus.DORMANT]])(
    'allows a posting to a %s account',
    async (status) => {
      const { accounts, port } = rig();
      const accountId = await seedAccount(accounts, { status });

      await expect(port.assertPostable(accountId, TEST_SESSION)).resolves.toBeUndefined();
    },
  );

  it.each([
    [AccountStatus.FROZEN, ErrorCode.ACCOUNT_FROZEN],
    [AccountStatus.CLOSED, ErrorCode.ACCOUNT_CLOSED],
    [AccountStatus.CLOSING, ErrorCode.ACCOUNT_CLOSED],
  ])('refuses a posting to a %s account', async (status, code) => {
    const { accounts, port } = rig();
    const accountId = await seedAccount(accounts, { status });

    await expect(port.assertPostable(accountId, TEST_SESSION)).rejects.toMatchObject({ code });
  });

  it('refuses an account that does not exist', async () => {
    const { port } = rig();

    await expect(
      port.assertPostable('acc_01JQ8Z00000000000000000000', TEST_SESSION),
    ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_NOT_FOUND });
  });
});

describe('currentBalance', () => {
  it('returns the booked balance, which is what the verifier diffs against', async () => {
    const { accounts, port } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp('4200'), held: gbp('1000') });

    const balance = await port.currentBalance(accountId);
    expect(balance?.equals(gbp('4200'))).toBe(true);
  });

  it('returns null for an unknown account rather than throwing', async () => {
    const { port } = rig();
    await expect(port.currentBalance('acc_01JQ8Z00000000000000000000')).resolves.toBeNull();
  });
});
