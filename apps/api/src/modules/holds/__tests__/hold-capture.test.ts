import { ErrorCode, HoldReason, HoldStatus } from '@reliance/contracts';

import { GL } from '../../../domain/ledger/index.js';
import { gbp, seedAccount } from '../../accounts/__tests__/accounts-harness.js';
import { isCapturable } from '../capture-recipes.js';

import { holdsRig, type HoldsRig } from './holds-harness.js';

const MERCHANT = 'Cafe Terzo';

async function heldAccount(
  rig: HoldsRig,
  amount = '12000',
  reason: HoldReason = HoldReason.CARD_AUTHORISATION,
) {
  const accountId = await seedAccount(rig.accounts, { ledger: gbp('50000') });
  const hold = await rig.holds.place({
    accountId,
    amount: gbp(amount),
    reason,
    description: MERCHANT,
    authorisationId: 'aut_01JQ8Z00000000000000000001',
  });

  return { accountId, hold };
}

describe('capturing a hold', () => {
  it('books a real journal entry and releases the hold, exactly once', async () => {
    const rig = holdsRig();
    const { accountId, hold } = await heldAccount(rig);

    const captured = await rig.capture.capture({ holdId: hold.id });

    expect(captured.status).toBe(HoldStatus.CAPTURED);
    expect(captured.capturedEntryId).not.toBeNull();

    const entry = await rig.ledger.entries.findByPublicId(captured.capturedEntryId ?? '');
    expect(entry?.postings).toHaveLength(2);
    expect(entry?.postings.map((posting) => posting.ledgerAccountCode).sort()).toEqual([
      GL.CARD_NETWORK_SETTLEMENT,
      GL.CUSTOMER_DEPOSITS,
    ]);

    const snapshot = await rig.balances.snapshot(accountId);
    expect(snapshot.ledger.amount.toString()).toBe('38000');
    expect(snapshot.held.amount.toString()).toBe('0');
    expect(snapshot.available.amount.toString()).toBe('38000');
  });

  it('refuses a second capture and leaves the money exactly once taken', async () => {
    const rig = holdsRig();
    const { accountId, hold } = await heldAccount(rig);

    await rig.capture.capture({ holdId: hold.id });
    await expect(rig.capture.capture({ holdId: hold.id })).rejects.toMatchObject({
      code: ErrorCode.HOLD_ALREADY_RELEASED,
    });

    const snapshot = await rig.balances.snapshot(accountId);
    expect(snapshot.ledger.amount.toString()).toBe('38000');
    expect(snapshot.held.amount.toString()).toBe('0');
  });

  it('refuses to capture a hold that was already released', async () => {
    const rig = holdsRig();
    const { hold } = await heldAccount(rig);

    await rig.holds.release({ holdId: hold.id });

    await expect(rig.capture.capture({ holdId: hold.id })).rejects.toMatchObject({
      code: ErrorCode.HOLD_ALREADY_RELEASED,
    });
  });

  it('takes only what was captured and frees the difference', async () => {
    const rig = holdsRig();
    const { accountId, hold } = await heldAccount(rig, '10000');

    const captured = await rig.capture.capture({ holdId: hold.id, amount: gbp('3000') });

    expect(captured.capturedAmount?.amount).toBe('3000');

    const snapshot = await rig.balances.snapshot(accountId);
    expect(snapshot.ledger.amount.toString()).toBe('47000');
    expect(snapshot.held.amount.toString()).toBe('0');
    // The £70 that was authorised but never taken is spendable again.
    expect(snapshot.available.amount.toString()).toBe('47000');
  });

  it('refuses a capture larger than the hold', async () => {
    const rig = holdsRig();
    const { accountId, hold } = await heldAccount(rig, '10000');

    await expect(
      rig.capture.capture({ holdId: hold.id, amount: gbp('10001') }),
    ).rejects.toMatchObject({ code: ErrorCode.AMOUNT_ABOVE_MAXIMUM });

    // Nothing moved, and the hold is still live.
    const snapshot = await rig.balances.snapshot(accountId);
    expect(snapshot.ledger.amount.toString()).toBe('50000');
    expect(snapshot.held.amount.toString()).toBe('10000');
  });

  it('refuses a capture of nothing — that is a release', async () => {
    const rig = holdsRig();
    const { hold } = await heldAccount(rig);

    await expect(rig.capture.capture({ holdId: hold.id, amount: gbp('0') })).rejects.toMatchObject({
      code: ErrorCode.INVALID_AMOUNT,
    });
  });

  it('books a pending transfer into the outbound clearing account', async () => {
    const rig = holdsRig();
    const { hold } = await heldAccount(rig, '12000', HoldReason.PENDING_TRANSFER);

    const captured = await rig.capture.capture({ holdId: hold.id });
    const entry = await rig.ledger.entries.findByPublicId(captured.capturedEntryId ?? '');

    expect(entry?.postings.map((posting) => posting.ledgerAccountCode).sort()).toEqual([
      GL.CUSTOMER_DEPOSITS,
      GL.UNSETTLED_OUTBOUND,
    ]);
  });

  it.each([
    HoldReason.COMPLIANCE_REVIEW,
    HoldReason.COURT_ORDER,
    HoldReason.DISPUTE,
    HoldReason.MANUAL_LIEN,
  ])('refuses to capture a %s hold — those are lifted, never claimed', async (reason) => {
    const rig = holdsRig();
    const { accountId, hold } = await heldAccount(rig, '12000', reason);

    expect(isCapturable(reason)).toBe(false);
    await expect(rig.capture.capture({ holdId: hold.id })).rejects.toMatchObject({
      code: ErrorCode.PRECONDITION_FAILED,
    });

    expect((await rig.balances.snapshot(accountId)).held.amount.toString()).toBe('12000');
  });

  it('carries the hold and authorisation onto the journal entry for traceability', async () => {
    const rig = holdsRig();
    const { hold } = await heldAccount(rig);

    const captured = await rig.capture.capture({ holdId: hold.id });
    const entry = await rig.ledger.entries.findByPublicId(captured.capturedEntryId ?? '');

    expect(entry?.metadata).toMatchObject({
      holdId: hold.id,
      authorisationId: 'aut_01JQ8Z00000000000000000001',
    });
  });

  it('refuses an unknown hold', async () => {
    const rig = holdsRig();

    await expect(
      rig.capture.capture({ holdId: 'hld_01JQ8Z00000000000000000000' }),
    ).rejects.toMatchObject({ code: ErrorCode.HOLD_NOT_FOUND });
  });
});
