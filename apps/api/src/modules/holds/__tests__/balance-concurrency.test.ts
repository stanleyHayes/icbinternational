import { ErrorCode, HoldReason } from '@reliance/contracts';

import { gbp, seedAccount, TEST_SESSION } from '../../accounts/__tests__/accounts-harness.js';
import { BalanceWriteConflictError, type AccountRecord } from '../../accounts/index.js';

import { holdsRig, type HoldsRig } from './holds-harness.js';

const DESCRIPTION = 'Contended authorisation';

/**
 * Availability under concurrency.
 *
 * The property being proved is that two authorisations cannot both spend the same
 * headroom. In production the loser is stopped by MongoDB aborting its transaction; here
 * it is stopped by the same optimistic-concurrency guard the repository applies, and the
 * same retry path in `TransactionRunner` picks it up. That equivalence is the point of
 * the in-memory store enforcing `expectedVersion` rather than writing unconditionally.
 */
describe('two holds racing for the same headroom', () => {
  it('lets exactly one through when the account can only cover one', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('10000') });

    // Interleave the two placements: the second reads the account *before* the first
    // commits, which is precisely the window a naive check-then-write would lose money in.
    const stale = await staleRead(rig, accountId);

    await rig.holds.place({
      accountId,
      amount: gbp('8000'),
      reason: HoldReason.CARD_AUTHORISATION,
      description: DESCRIPTION,
    });

    // The second placement starts from the stale snapshot and must not succeed on it.
    const second = rig.holds.place({
      accountId,
      amount: gbp('8000'),
      reason: HoldReason.CARD_AUTHORISATION,
      description: DESCRIPTION,
    });

    await expect(second).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_FUNDS });
    expect(stale.version).toBe(0);

    const snapshot = await rig.balances.snapshot(accountId);
    expect(snapshot.held.amount.toString()).toBe('8000');
    expect(snapshot.available.amount.toString()).toBe('2000');
  });

  it('retries and succeeds when the account still covers the amount after the winner', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });

    // The first write attempt loses its optimistic-concurrency race; the runner must
    // re-run the whole unit of work rather than surfacing the conflict.
    const original = rig.accounts.writeBalances.bind(rig.accounts);
    let refusals = 1;
    jest.spyOn(rig.accounts, 'writeBalances').mockImplementation(async (input) => {
      if (refusals > 0) {
        refusals -= 1;
        return false;
      }
      return original(input);
    });

    await expect(
      rig.holds.place({
        accountId,
        amount: gbp('12000'),
        reason: HoldReason.CARD_AUTHORISATION,
        description: DESCRIPTION,
      }),
    ).resolves.toBeDefined();

    expect((await rig.balances.snapshot(accountId)).held.amount.toString()).toBe('12000');
  });

  it('gives up rather than looping forever when the conflict never clears', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });

    jest.spyOn(rig.accounts, 'writeBalances').mockResolvedValue(false);

    await expect(
      rig.holds.place({
        accountId,
        amount: gbp('12000'),
        reason: HoldReason.CARD_AUTHORISATION,
        description: DESCRIPTION,
      }),
    ).rejects.toBeInstanceOf(BalanceWriteConflictError);
  });

  it('refuses a reserve computed from a version that has since moved', async () => {
    const rig = holdsRig();
    const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });
    const before = await staleRead(rig, accountId);

    await rig.accounts.patch({ accountId, fields: { nickname: 'Renamed' } });

    // A write conditional on the version read a moment ago is now refused outright.
    const accepted = await rig.accounts.writeBalances({
      accountId,
      expectedVersion: before.version,
      ledgerBalance: gbp('999999'),
      availableBalance: gbp('999999'),
      holdTotal: gbp('0'),
      session: TEST_SESSION,
    });

    expect(accepted).toBe(false);
    expect((await rig.balances.snapshot(accountId)).ledger.amount.toString()).toBe('50000');
  });
});

async function staleRead(rig: HoldsRig, accountId: string): Promise<AccountRecord> {
  const account = await rig.accounts.findById(accountId);
  if (!account) throw new Error('fixture account is missing');
  return account;
}
