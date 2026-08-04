import { AccountStatus, ErrorCode, HoldReason, HoldStatus } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { gbp, seedAccount, TEST_SESSION } from '../../accounts/__tests__/accounts-harness.js';
import { computeAvailability } from '../../accounts/index.js';

import { holdsRig } from './holds-harness.js';

const DESCRIPTION = 'Cafe Terzo';

describe('placing a hold', () => {
  it('reduces availability without moving the ledger balance', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });

    await rig.holds.place({
      accountId,
      amount: gbp('12000'),
      reason: HoldReason.CARD_AUTHORISATION,
      description: DESCRIPTION,
    });

    const snapshot = await rig.balances.snapshot(accountId);
    expect(snapshot.ledger.amount.toString()).toBe('50000');
    expect(snapshot.held.amount.toString()).toBe('12000');
    expect(snapshot.available.amount.toString()).toBe('38000');
  });

  it('keeps the stored available balance equal to ledger minus holds', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });

    await rig.holds.place({
      accountId,
      amount: gbp('12000'),
      reason: HoldReason.PENDING_TRANSFER,
      description: DESCRIPTION,
    });

    const account = await rig.accounts.findById(accountId);
    expect(account?.availableBalance.amount).toBe('38000');
  });

  it('lets a customer hold into an arranged overdraft', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, {
      ledger: gbp('1000'),
      overdraft: gbp('20000'),
    });

    await rig.holds.place({
      accountId,
      amount: gbp('15000'),
      reason: HoldReason.CARD_AUTHORISATION,
      description: DESCRIPTION,
    });

    const snapshot = await rig.balances.snapshot(accountId);
    expect(snapshot.available.amount.toString()).toBe('6000');
    expect(snapshot.overdraftAvailable.amount.toString()).toBe('6000');
  });

  it('refuses a hold larger than what is available', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('5000') });

    await expect(
      rig.holds.place({
        accountId,
        amount: gbp('5001'),
        reason: HoldReason.CARD_AUTHORISATION,
        description: DESCRIPTION,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_FUNDS });

    expect((await rig.accounts.findById(accountId))?.holdTotal.amount).toBe('0');
  });

  it('allows a hold for exactly the available balance', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('5000') });

    await expect(
      rig.holds.place({
        accountId,
        amount: gbp('5000'),
        reason: HoldReason.CARD_AUTHORISATION,
        description: DESCRIPTION,
      }),
    ).resolves.toMatchObject({ status: HoldStatus.ACTIVE });
  });

  it('refuses a non-positive hold', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('5000') });

    await expect(
      rig.holds.place({
        accountId,
        amount: gbp('0'),
        reason: HoldReason.MANUAL_LIEN,
        description: DESCRIPTION,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_AMOUNT });
  });

  it('refuses a hold on a frozen account', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, {
      ledger: gbp('50000'),
      status: AccountStatus.FROZEN,
    });

    await expect(
      rig.holds.place({
        accountId,
        amount: gbp('100'),
        reason: HoldReason.CARD_AUTHORISATION,
        description: DESCRIPTION,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_FROZEN });
  });

  it('refuses a hold in the wrong currency', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });

    await expect(
      rig.holds.place({
        accountId,
        amount: Money.fromMinor('100', 'USD'),
        reason: HoldReason.CARD_AUTHORISATION,
        description: DESCRIPTION,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.CURRENCY_MISMATCH });
  });

  it('accumulates several holds against one account', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });

    for (const amount of ['1000', '2000', '3000']) {
      await rig.holds.place({
        accountId,
        amount: gbp(amount),
        reason: HoldReason.CARD_AUTHORISATION,
        description: DESCRIPTION,
      });
    }

    expect((await rig.balances.snapshot(accountId)).held.amount.toString()).toBe('6000');
    expect(await rig.holds.listActive(accountId)).toHaveLength(3);
  });
});

describe('releasing a hold', () => {
  it('gives the money back and leaves the ledger untouched', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });
    const hold = await rig.holds.place({
      accountId,
      amount: gbp('12000'),
      reason: HoldReason.CARD_AUTHORISATION,
      description: DESCRIPTION,
    });

    const released = await rig.holds.release({ holdId: hold.id });

    expect(released.status).toBe(HoldStatus.RELEASED);
    expect(released.resolvedAt).not.toBeNull();

    const snapshot = await rig.balances.snapshot(accountId);
    expect(snapshot.ledger.amount.toString()).toBe('50000');
    expect(snapshot.held.amount.toString()).toBe('0');
    expect(snapshot.available.amount.toString()).toBe('50000');
  });

  it('releases exactly once — the second attempt is refused, not repeated', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });
    const hold = await rig.holds.place({
      accountId,
      amount: gbp('12000'),
      reason: HoldReason.CARD_AUTHORISATION,
      description: DESCRIPTION,
    });

    await rig.holds.release({ holdId: hold.id });
    await expect(rig.holds.release({ holdId: hold.id })).rejects.toMatchObject({
      code: ErrorCode.HOLD_ALREADY_RELEASED,
    });

    // The decisive assertion: the reserve was returned once, not twice.
    expect((await rig.balances.snapshot(accountId)).available.amount.toString()).toBe('50000');
  });

  it('refuses an unknown hold', async () => {
    const rig = holdsRig();

    await expect(
      rig.holds.release({ holdId: 'hld_01JQ8Z00000000000000000000' }),
    ).rejects.toMatchObject({ code: ErrorCode.HOLD_NOT_FOUND });
  });
});

describe('expiring holds', () => {
  it('resolves holds whose time has passed and restores their reserves', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });

    await rig.holds.place({
      accountId,
      amount: gbp('12000'),
      reason: HoldReason.CARD_AUTHORISATION,
      description: DESCRIPTION,
      expiresAt: new Date(rig.clock.timestamp() - 1000),
    });

    await expect(rig.holds.expireDue()).resolves.toBe(1);

    const [hold] = rig.holdStore.all();
    expect(hold?.status).toBe(HoldStatus.EXPIRED);
    expect((await rig.balances.snapshot(accountId)).available.amount.toString()).toBe('50000');
  });

  it('leaves a hold that has not reached its expiry', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });

    await rig.holds.place({
      accountId,
      amount: gbp('12000'),
      reason: HoldReason.CARD_AUTHORISATION,
      description: DESCRIPTION,
      expiresAt: new Date(rig.clock.timestamp() + 60_000),
    });

    await expect(rig.holds.expireDue()).resolves.toBe(0);
  });

  it('never expires a hold with no expiry, such as a court order', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });

    await rig.holds.place({
      accountId,
      amount: gbp('12000'),
      reason: HoldReason.COURT_ORDER,
      description: 'Freezing order',
    });

    await expect(rig.holds.expireDue()).resolves.toBe(0);
  });

  it('skips a hold that something else resolved mid-sweep', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });
    const hold = await rig.holds.place({
      accountId,
      amount: gbp('12000'),
      reason: HoldReason.CARD_AUTHORISATION,
      description: DESCRIPTION,
      expiresAt: new Date(rig.clock.timestamp() - 1000),
    });

    // The sweep reads the hold, then a concurrent release wins the status transition.
    jest.spyOn(rig.holdStore, 'listExpired').mockResolvedValueOnce([hold]);
    await rig.holds.release({ holdId: hold.id });

    await expect(rig.holds.expireDue()).resolves.toBe(0);
    expect((await rig.balances.snapshot(accountId)).available.amount.toString()).toBe('50000');
  });
});

describe('assertSufficientFunds', () => {
  it('passes when the account covers the amount and refuses when it does not', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('5000') });

    await expect(
      rig.balances.assertSufficientFunds(accountId, gbp('5000'), TEST_SESSION),
    ).resolves.toMatchObject({ available: expect.anything() });

    await expect(
      rig.balances.assertSufficientFunds(accountId, gbp('5001'), TEST_SESSION),
    ).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_FUNDS });
  });

  it('counts an existing hold against the caller', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('5000'), held: gbp('4000') });
    const account = await rig.accounts.findById(accountId);

    expect(computeAvailability(account!).available.amount.toString()).toBe('1000');
    await expect(
      rig.balances.assertSufficientFunds(accountId, gbp('1001'), TEST_SESSION),
    ).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_FUNDS });
  });

  it('refuses an unknown account', async () => {
    const rig = holdsRig();

    await expect(
      rig.balances.assertSufficientFunds('acc_01JQ8Z00000000000000000000', gbp('1'), TEST_SESSION),
    ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_NOT_FOUND });
  });
});
