import { ErrorCode } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { gbp, seedAccount, TEST_USER } from '../../accounts/__tests__/accounts-harness.js';
import { type DepositStore } from '../deposit.store.js';
import { DepositStatus } from '../deposit.types.js';

import {
  depositsRig,
  MINIMUM_PLACEMENT,
  placementRequest,
  type DepositsRig,
} from './deposits-harness.js';

/**
 * A deposit record and the money that funds it are one event.
 *
 * The failure this suite exists for is specific and expensive: an `ACTIVE` deposit whose
 * placement posting never landed. Nothing later can tell it apart from a funded one, so
 * the maturity run pays it out **with interest** to an account that never gave the
 * principal up — the bank creates money. Every test here forces one half of a movement to
 * fail and asserts the other half did not survive it.
 */

const FUNDED = gbp('500000');
const LEDGER_REFUSED = 'the ledger refused this posting';

/**
 * The error a call was expected to refuse with.
 *
 * Fails loudly when the call succeeds, so a test can never pass by asserting properties on
 * a value that was never an error.
 */
async function refusal(promise: Promise<unknown>): Promise<AppError> {
  return promise.then(
    () => {
      throw new Error('Expected the call to be refused, but it succeeded.');
    },
    (error: unknown) => error as AppError,
  );
}

/** A rig with one funded current account, which every placement here draws on. */
async function fundedRig(
  balance: Money = FUNDED,
): Promise<{ rig: DepositsRig; accountId: string }> {
  const rig = depositsRig();
  const accountId = await seedAccount(rig.accounts, { ledger: balance });
  return { rig, accountId };
}

describe('placing a deposit', () => {
  it('leaves no deposit record behind when the placement posting fails', async () => {
    const { rig, accountId } = await fundedRig();
    jest.spyOn(rig.ledger.postings, 'post').mockRejectedValue(new Error(LEDGER_REFUSED));

    await expect(rig.service.place(TEST_USER, placementRequest(accountId))).rejects.toThrow(
      LEDGER_REFUSED,
    );

    // The whole point. An ACTIVE record here is an unfunded deposit earning interest.
    expect(rig.deposits.all()).toHaveLength(0);
  });

  it('writes the record and the posting on the same session', async () => {
    const { rig, accountId } = await fundedRig();
    const insert = jest.spyOn<DepositStore, 'insert'>(rig.deposits, 'insert');
    const post = jest.spyOn(rig.ledger.postings, 'post');

    await rig.service.place(TEST_USER, placementRequest(accountId));

    const insertSession = insert.mock.calls[0]?.[1];
    expect(insertSession).toBeDefined();
    expect(post.mock.calls[0]?.[1]).toBe(insertSession);
  });

  it('refuses an underfunded placement before anything is written, naming what is available', async () => {
    const { rig, accountId } = await fundedRig(gbp('50000'));

    const failure = await refusal(rig.service.place(TEST_USER, placementRequest(accountId)));

    expect(failure).toBeInstanceOf(AppError);
    expect(failure.code).toBe(ErrorCode.INSUFFICIENT_FUNDS);
    // The pre-flight check names the shortfall; the ledger's floor can only say "not
    // enough". Asserting the figures is what pins the better message in place.
    expect(failure.message).toContain(gbp('50000').format());
    expect(failure.message).toContain(MINIMUM_PLACEMENT.format());

    expect(rig.deposits.all()).toHaveLength(0);
    expect(await rig.ledger.entries.scanFrom({ limit: 10 })).toHaveLength(0);
  });

  it('funds the deposit out of the source account when everything succeeds', async () => {
    const { rig, accountId } = await fundedRig();

    const deposit = await rig.service.place(TEST_USER, placementRequest(accountId));

    expect(deposit.status).toBe(DepositStatus.ACTIVE);
    const snapshot = await rig.balances.snapshot(accountId);
    expect(snapshot.ledger.equals(FUNDED.minus(MINIMUM_PLACEMENT))).toBe(true);
  });
});

describe('breaking a deposit early', () => {
  it('writes the release posting and the closure on the same session', async () => {
    const { rig, accountId } = await fundedRig();
    const placed = await rig.service.place(TEST_USER, placementRequest(accountId));

    const post = jest.spyOn(rig.ledger.postings, 'post');
    const patch = jest.spyOn<DepositStore, 'patch'>(rig.deposits, 'patch');
    await rig.service.breakEarly(TEST_USER, placed.id);

    const postSession = post.mock.calls[0]?.[1];
    expect(postSession).toBeDefined();
    expect(patch.mock.calls[0]?.[2]).toBe(postSession);
  });

  it('leaves the deposit active when the release posting fails', async () => {
    const { rig, accountId } = await fundedRig();
    const placed = await rig.service.place(TEST_USER, placementRequest(accountId));
    jest.spyOn(rig.ledger.postings, 'post').mockRejectedValue(new Error(LEDGER_REFUSED));

    await expect(rig.service.breakEarly(TEST_USER, placed.id)).rejects.toThrow(LEDGER_REFUSED);

    const stored = await rig.deposits.findById(placed.id);
    expect(stored?.status).toBe(DepositStatus.ACTIVE);
    expect(stored?.brokenAt).toBeNull();
  });
});

describe('maturity', () => {
  /** Places a deposit and moves the business date past its maturity. */
  async function matured(autoRollover: boolean) {
    const { rig, accountId } = await fundedRig();
    const placed = await rig.service.place(
      TEST_USER,
      placementRequest(accountId, { autoRollover }),
    );

    rig.clock.freezeAt(new Date('2027-03-02T09:00:00.000Z'));
    return { rig, placed };
  }

  it('pays the deposit out and closes it on the same session', async () => {
    const { rig, placed } = await matured(false);
    const post = jest.spyOn(rig.ledger.postings, 'post');
    const patch = jest.spyOn<DepositStore, 'patch'>(rig.deposits, 'patch');

    expect(await rig.maturity.run()).toBe(1);

    const postSession = post.mock.calls[0]?.[1];
    expect(postSession).toBeDefined();
    expect(patch.mock.calls[0]?.[2]).toBe(postSession);
    expect((await rig.deposits.findById(placed.id))?.status).toBe(DepositStatus.MATURED);
  });

  it('leaves no half-renewed deposit behind when the rollover fails midway', async () => {
    const { rig, placed } = await matured(true);
    // The renewal is inserted before the old deposit is closed. Failing the closure is
    // what strands an ACTIVE renewal that no posting ever funded.
    jest.spyOn(rig.deposits, 'patch').mockRejectedValueOnce(new Error('the closure failed'));

    await expect(rig.maturity.run()).rejects.toThrow('the closure failed');

    expect(rig.deposits.all()).toHaveLength(1);
    const stored = await rig.deposits.findById(placed.id);
    expect(stored?.status).toBe(DepositStatus.ACTIVE);
    expect(stored?.rolledIntoId).toBeNull();
  });

  it('renews the principal and links the two deposits when it succeeds', async () => {
    const { rig, placed } = await matured(true);

    expect(await rig.maturity.run()).toBe(1);

    const closed = await rig.deposits.findById(placed.id);
    expect(closed?.status).toBe(DepositStatus.ROLLED_OVER);
    expect(closed?.rolledIntoId).not.toBeNull();

    const renewed = await rig.deposits.findById(closed?.rolledIntoId ?? '');
    expect(renewed?.status).toBe(DepositStatus.ACTIVE);
    expect(renewed?.rolledFromId).toBe(placed.id);
  });

  it('does not pay a deposit out twice when the run is repeated', async () => {
    const { rig } = await matured(false);

    expect(await rig.maturity.run()).toBe(1);
    expect(await rig.maturity.run()).toBe(0);
  });
});
