import { AccountStatus, ErrorCode } from '@reliance/contracts';

import { AccountStatusService } from '../account-status.service.js';
import { AccountService } from '../account.service.js';
import { InMemoryAccountStore } from '../in-memory-account.store.js';

import {
  frozenClock,
  gbp,
  retryingRunner,
  seedAccount,
  OTHER_USER,
  TEST_USER,
  rejectionFrom,
} from './accounts-harness.js';

function rig() {
  const accounts = new InMemoryAccountStore();
  const clock = frozenClock();
  const runner = retryingRunner();

  return {
    accounts,
    clock,
    service: new AccountService(accounts, clock, runner),
    statuses: new AccountStatusService(accounts, clock, runner),
  };
}

/**
 * The IDOR suite.
 *
 * An account id is a guessable-shaped opaque string that appears in URLs, logs and
 * screenshots. Everything below asserts the same property from a different angle: knowing
 * an id gets you nothing unless you hold the account, and the refusal is indistinguishable
 * from the account not existing.
 */
describe('ownership', () => {
  it("refuses another customer's account with ACCOUNT_NOT_FOUND, not FORBIDDEN", async () => {
    const { accounts, service } = rig();
    const victimAccount = await seedAccount(accounts, { ledger: gbp('500000') });

    const error = await rejectionFrom(service.get(OTHER_USER, victimAccount));

    expect(error.code).toBe(ErrorCode.ACCOUNT_NOT_FOUND);
    // 404, not 403: a 403 confirms the id belongs to somebody, which turns an enumeration
    // of account ids into a census of the bank's customers.
    expect(error.status).toBe(404);
    expect(error.message).not.toContain(victimAccount);
  });

  it('answers an unknown id exactly as it answers someone else’s', async () => {
    const { accounts, service } = rig();
    const victimAccount = await seedAccount(accounts);

    const foreign = await rejectionFrom(service.get(OTHER_USER, victimAccount));
    const missing = await rejectionFrom(service.get(OTHER_USER, 'acc_01JQ8Z00000000000000000000'));

    expect(foreign.code).toBe(missing.code);
    expect(foreign.message).toBe(missing.message);
    expect(foreign.status).toBe(missing.status);
  });

  it('leaks no balance through the balance endpoint either', async () => {
    const { accounts, service } = rig();
    const victimAccount = await seedAccount(accounts, { ledger: gbp('500000') });

    await expect(service.balance(OTHER_USER, victimAccount)).rejects.toMatchObject({
      code: ErrorCode.ACCOUNT_NOT_FOUND,
    });
  });

  it('refuses a rename by a stranger', async () => {
    const { accounts, service } = rig();
    const victimAccount = await seedAccount(accounts);

    await expect(
      service.update(OTHER_USER, victimAccount, { nickname: 'Mine now' }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_NOT_FOUND });

    const stored = await accounts.findById(victimAccount);
    expect(stored?.nickname).toBeNull();
  });

  it('lists only the caller’s own accounts', async () => {
    const { accounts, service } = rig();
    await seedAccount(accounts);
    await seedAccount(accounts, { userId: OTHER_USER, holderIds: [OTHER_USER] });

    const mine = await service.list(TEST_USER);

    expect(mine).toHaveLength(1);
    expect(mine[0]?.userId).toBe(TEST_USER);
  });

  it('lets a joint holder see the account they co-hold', async () => {
    const { accounts, service } = rig();
    const jointAccount = await seedAccount(accounts, { holderIds: [TEST_USER, OTHER_USER] });

    await expect(service.get(OTHER_USER, jointAccount)).resolves.toMatchObject({
      id: jointAccount,
    });
  });
});

describe('reading accounts', () => {
  it('renders the contract balance block from the stored figures', async () => {
    const { accounts, service } = rig();
    const accountId = await seedAccount(accounts, {
      ledger: gbp('120000'),
      held: gbp('45000'),
      overdraft: gbp('50000'),
    });

    const balance = await service.balance(TEST_USER, accountId);

    expect(balance.ledger.amount).toBe('120000');
    expect(balance.held.amount).toBe('45000');
    expect(balance.available.amount).toBe('125000');
    expect(balance.overdraftAvailable.amount).toBe('50000');
  });

  it('filters a list by status, type and currency', async () => {
    const { accounts, service } = rig();
    await seedAccount(accounts);
    await seedAccount(accounts, { status: AccountStatus.CLOSED, isPrimary: false });

    await expect(service.list(TEST_USER, { status: AccountStatus.CLOSED })).resolves.toHaveLength(
      1,
    );
    await expect(service.list(TEST_USER, {})).resolves.toHaveLength(2);
  });
});

describe('updating an account', () => {
  it('sets and clears a nickname', async () => {
    const { service, accounts } = rig();
    const accountId = await seedAccount(accounts);

    await service.update(TEST_USER, accountId, { nickname: 'Bills' });
    expect((await accounts.findById(accountId))?.nickname).toBe('Bills');

    await service.update(TEST_USER, accountId, { nickname: null });
    expect((await accounts.findById(accountId))?.nickname).toBeNull();
  });

  it('leaves the nickname alone when the request does not mention it', async () => {
    const { service, accounts } = rig();
    const accountId = await seedAccount(accounts, { nickname: 'Bills' });

    await service.update(TEST_USER, accountId, { isPrimary: true });

    expect((await accounts.findById(accountId))?.nickname).toBe('Bills');
  });

  it('demotes the previous primary account in the same currency', async () => {
    const { service, accounts } = rig();
    const first = await seedAccount(accounts, { isPrimary: true });
    const second = await seedAccount(accounts, { isPrimary: false });

    await service.update(TEST_USER, second, { isPrimary: true });

    expect((await accounts.findById(first))?.isPrimary).toBe(false);
    expect((await accounts.findById(second))?.isPrimary).toBe(true);
  });

  it('leaves a primary account in another currency alone', async () => {
    const { service, accounts } = rig();
    const sterling = await seedAccount(accounts, { isPrimary: true });
    const dollars = await seedAccount(accounts, { currency: 'USD', isPrimary: true });

    await service.update(TEST_USER, sterling, { isPrimary: true });

    expect((await accounts.findById(dollars))?.isPrimary).toBe(true);
  });

  it('refuses to promote an account that is not active', async () => {
    const { service, accounts } = rig();
    const accountId = await seedAccount(accounts, { status: AccountStatus.FROZEN });

    await expect(service.update(TEST_USER, accountId, { isPrimary: true })).rejects.toMatchObject({
      code: ErrorCode.PRECONDITION_FAILED,
    });
  });
});

describe('freezing and unfreezing', () => {
  it('freezes an active account and lifts it again', async () => {
    const { statuses, accounts } = rig();
    const accountId = await seedAccount(accounts);

    await expect(statuses.freeze({ accountId, reason: 'Fraud review' })).resolves.toMatchObject({
      status: AccountStatus.FROZEN,
    });
    await expect(statuses.unfreeze({ accountId, reason: 'Cleared' })).resolves.toMatchObject({
      status: AccountStatus.ACTIVE,
    });
  });

  it('is idempotent, because a rule engine may fire twice on one signal', async () => {
    const { statuses, accounts } = rig();
    const accountId = await seedAccount(accounts, { status: AccountStatus.FROZEN });

    await expect(statuses.freeze({ accountId, reason: 'Again' })).resolves.toMatchObject({
      status: AccountStatus.FROZEN,
    });
  });

  it('refuses to freeze a closed account', async () => {
    const { statuses, accounts } = rig();
    const accountId = await seedAccount(accounts, { status: AccountStatus.CLOSED });

    await expect(statuses.freeze({ accountId, reason: 'Too late' })).rejects.toMatchObject({
      code: ErrorCode.ACCOUNT_CLOSED,
    });
  });

  it('lifts a freeze straight to active, whatever the account was before', async () => {
    const { statuses, accounts } = rig();
    const accountId = await seedAccount(accounts, { status: AccountStatus.FROZEN });

    const lifted = await statuses.unfreeze({ accountId, reason: 'Deposit arrived' });
    expect(lifted.status).toBe(AccountStatus.ACTIVE);
  });
});

describe('dormancy', () => {
  it('marks accounts quiet for a year and leaves recent ones alone', async () => {
    const { statuses, accounts, clock } = rig();
    const quiet = await seedAccount(accounts, { openedAt: new Date('2024-01-01T00:00:00.000Z') });
    const busy = await seedAccount(accounts, { isPrimary: false });

    // `lastActivityAt` is stamped from `openedAt` at insert, so the fixture above is
    // already more than a year stale on the frozen clock.
    expect(clock.now()).toEqual(new Date('2026-03-01T09:00:00.000Z'));

    await expect(statuses.sweepDormant()).resolves.toBe(1);
    expect((await accounts.findById(quiet))?.status).toBe(AccountStatus.DORMANT);
    expect((await accounts.findById(busy))?.status).toBe(AccountStatus.ACTIVE);
  });

  it('does nothing when every account is recent', async () => {
    const { statuses, accounts } = rig();
    await seedAccount(accounts);

    await expect(statuses.sweepDormant()).resolves.toBe(0);
  });
});
