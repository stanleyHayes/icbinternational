import { AccountStatus, ErrorCode } from '@reliance/contracts';

import { toStored } from '../../../common/money/money.codec.js';
import { AccountClosureService } from '../account-closure.service.js';
import { InMemoryAccountStore } from '../in-memory-account.store.js';

import {
  frozenClock,
  gbp,
  ledgerRigFor,
  retryingRunner,
  seedAccount,
  OTHER_USER,
  TEST_USER,
} from './accounts-harness.js';

const REASON = 'Moving to another bank';

function rig() {
  const accounts = new InMemoryAccountStore();
  const clock = frozenClock();
  const runner = retryingRunner();
  const ledger = ledgerRigFor(accounts, clock, runner);

  return {
    accounts,
    ledger,
    closure: new AccountClosureService(accounts, ledger.postings, clock, runner),
  };
}

describe('closing an account', () => {
  it('closes an empty account and stops it being the primary one', async () => {
    const { accounts, closure } = rig();
    const accountId = await seedAccount(accounts, { isPrimary: true });

    const closed = await closure.close({
      userId: TEST_USER,
      accountId,
      request: { reason: REASON },
    });

    expect(closed.status).toBe(AccountStatus.CLOSED);
    expect(closed.closedAt).not.toBeNull();
    expect(closed.isPrimary).toBe(false);
  });

  it('refuses an account that still holds money', async () => {
    const { accounts, closure } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp('2500') });

    await expect(
      closure.close({ userId: TEST_USER, accountId, request: { reason: REASON } }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_NOT_EMPTY });

    expect((await accounts.findById(accountId))?.status).toBe(AccountStatus.ACTIVE);
  });

  it('refuses an overdrawn account, which cannot be swept clear', async () => {
    const { accounts, closure } = rig();
    const accountId = await seedAccount(accounts, {
      ledger: gbp('-2500'),
      overdraft: gbp('50000'),
    });

    await expect(
      closure.close({
        userId: TEST_USER,
        accountId,
        request: { reason: REASON, sweepToAccountId: await seedAccount(accounts) },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_NOT_EMPTY });
  });

  it('refuses an account with an active hold, whatever its balance', async () => {
    const { accounts, closure } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp('4000'), held: gbp('4000') });

    await expect(
      closure.close({ userId: TEST_USER, accountId, request: { reason: REASON } }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_HAS_ACTIVE_HOLDS });
  });

  it('reports the hold before the balance, because releasing it is the first step', async () => {
    const { accounts, closure } = rig();
    const target = await seedAccount(accounts, { isPrimary: false });
    const accountId = await seedAccount(accounts, { ledger: gbp('9000'), held: gbp('1000') });

    await expect(
      closure.close({
        userId: TEST_USER,
        accountId,
        request: { reason: REASON, sweepToAccountId: target },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_HAS_ACTIVE_HOLDS });
  });

  it('sweeps the residue through the ledger, then closes', async () => {
    const { accounts, closure, ledger } = rig();
    const target = await seedAccount(accounts, { isPrimary: false });
    const accountId = await seedAccount(accounts, { ledger: gbp('7500') });

    const closed = await closure.close({
      userId: TEST_USER,
      accountId,
      request: { reason: REASON, sweepToAccountId: target },
    });

    expect(closed.status).toBe(AccountStatus.CLOSED);
    expect(closed.balance.ledger.amount).toBe('0');
    expect((await accounts.findById(target))?.ledgerBalance).toEqual(toStored(gbp('7500')));

    // The sweep is a real double-entry movement, not a balance edit.
    const entry = await ledger.entries.findByReference(`CLOSE-${accountId}`);
    expect(entry?.postings).toHaveLength(2);
  });

  it('refuses a sweep to an account in another currency', async () => {
    const { accounts, closure } = rig();
    const target = await seedAccount(accounts, { currency: 'USD', isPrimary: false });
    const accountId = await seedAccount(accounts, { ledger: gbp('7500') });

    await expect(
      closure.close({
        userId: TEST_USER,
        accountId,
        request: { reason: REASON, sweepToAccountId: target },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it("refuses a sweep to somebody else's account", async () => {
    const { accounts, closure } = rig();
    const target = await seedAccount(accounts, {
      userId: OTHER_USER,
      holderIds: [OTHER_USER],
      isPrimary: false,
    });
    const accountId = await seedAccount(accounts, { ledger: gbp('7500') });

    await expect(
      closure.close({
        userId: TEST_USER,
        accountId,
        request: { reason: REASON, sweepToAccountId: target },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('refuses a sweep back into the account being closed', async () => {
    const { accounts, closure } = rig();
    const accountId = await seedAccount(accounts, { ledger: gbp('7500') });

    await expect(
      closure.close({
        userId: TEST_USER,
        accountId,
        request: { reason: REASON, sweepToAccountId: accountId },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it("refuses to close somebody else's account", async () => {
    const { accounts, closure } = rig();
    const accountId = await seedAccount(accounts);

    await expect(
      closure.close({ userId: OTHER_USER, accountId, request: { reason: REASON } }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_NOT_FOUND });
  });

  it('is idempotent for a customer who taps twice', async () => {
    const { accounts, closure } = rig();
    const accountId = await seedAccount(accounts);

    await closure.close({ userId: TEST_USER, accountId, request: { reason: REASON } });
    const again = await closure.close({
      userId: TEST_USER,
      accountId,
      request: { reason: REASON },
    });

    expect(again.status).toBe(AccountStatus.CLOSED);
  });

  it('leaves nothing behind when the sweep cannot complete', async () => {
    const { accounts, closure, ledger } = rig();
    const frozenTarget = await seedAccount(accounts, {
      isPrimary: false,
      status: AccountStatus.ACTIVE,
    });
    const accountId = await seedAccount(accounts, { ledger: gbp('7500') });

    // Freeze the destination *after* the ownership checks would pass, so the failure comes
    // from the posting itself — the case where a rollback actually has to work.
    await accounts.patch({
      accountId: frozenTarget,
      fields: { status: AccountStatus.FROZEN },
    });

    await expect(
      closure.close({
        userId: TEST_USER,
        accountId,
        request: { reason: REASON, sweepToAccountId: frozenTarget },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });

    expect((await accounts.findById(accountId))?.status).toBe(AccountStatus.ACTIVE);
    expect(await ledger.entries.findByReference(`CLOSE-${accountId}`)).toBeNull();
  });
});
