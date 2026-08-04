import { BillPaymentStatus } from '@reliance/contracts';

import { BillerRejection } from '../../../rails/biller/index.js';
import { REFUND_STRANDED_AFTER_MS, REFUSAL_COPY, REJECTION_COPY } from '../bill-pay.constants.js';

import { billPayRig, paymentDraft, type BillPayRig } from './bill-pay-harness.js';

/**
 * The failure this file exists for.
 *
 * A payment is debited, claimed `SUBMITTED`, refused by the biller — and then the reversal
 * transaction throws. Before the two-step refund, that left the payment in `SUBMITTED`
 * forever: the retry could not re-claim it, because the conditional write only accepts
 * `PENDING`, and nothing else was looking. The customer was short the money with no path to
 * getting it back, which is the exact outcome the auto-reversal rule exists to prevent.
 *
 * Every test below fails against that design.
 */

/** Submits a payment whose biller refuses and whose first reversal cannot be committed. */
async function strand(rig: BillPayRig, reversalFailures = 1): Promise<string> {
  const payment = await rig.payments.insert(paymentDraft(rig.clock.now()));
  rig.rail.refuses(BillerRejection.ACCOUNT_CLOSED);
  rig.poster.failReversals(reversalFailures);

  await expect(rig.service.submit(payment.id)).rejects.toThrow(/reversal/u);
  return payment.id;
}

/** Moves the bank's clock past the point where an unfinished refund counts as stranded. */
function passTheThreshold(rig: BillPayRig): void {
  rig.clock.advance(REFUND_STRANDED_AFTER_MS + 1);
}

describe('a reversal that cannot be committed', () => {
  it('leaves the payment in a status a retry is allowed to claim', async () => {
    const rig = billPayRig();
    const paymentId = await strand(rig);

    const stuck = await rig.payments.findByIdUnscoped(paymentId);

    expect(stuck?.status).toBe(BillPaymentStatus.REJECTED);
    expect(stuck?.reversalEntryId).toBeNull();
    expect(rig.poster.reversalCount).toBe(0);
  });

  it('never claims the money is back when it is not', async () => {
    const rig = billPayRig();
    const paymentId = await strand(rig);

    const stuck = await rig.payments.findByIdUnscoped(paymentId);

    expect(stuck?.failureReason).toBe(REFUSAL_COPY.ACCOUNT_CLOSED);
    expect(stuck?.failureReason).not.toMatch(/put the money back|refunded|we have returned/iu);
  });

  it('is finished by the next attempt of the same job, without calling the biller again', async () => {
    const rig = billPayRig();
    const paymentId = await strand(rig);

    const refunded = await rig.service.submit(paymentId);

    expect(refunded?.status).toBe(BillPaymentStatus.REFUNDED);
    expect(refunded?.reversalEntryId).toBe(`jnl_reverse_${paymentId}`);
    expect(refunded?.failureReason).toBe(REJECTION_COPY.ACCOUNT_CLOSED);
    expect(rig.rail.submitted).toStrictEqual([paymentId]);
  });
});

describe('the refund sweep', () => {
  it('picks up a payment whose reversal never landed', async () => {
    const rig = billPayRig();
    const paymentId = await strand(rig);
    passTheThreshold(rig);

    const result = await rig.sweeper.sweep();

    expect(result).toStrictEqual({ stranded: 1, refunded: 1 });
    const settled = await rig.payments.findByIdUnscoped(paymentId);
    expect(settled?.status).toBe(BillPaymentStatus.REFUNDED);
    expect(settled?.reversalEntryId).toBe(`jnl_reverse_${paymentId}`);
  });

  it('refunds exactly once however many times it runs', async () => {
    const rig = billPayRig();
    const paymentId = await strand(rig);
    passTheThreshold(rig);

    const first = await rig.sweeper.sweep();
    const second = await rig.sweeper.sweep();

    expect(first.refunded).toBe(1);
    expect(second).toStrictEqual({ stranded: 0, refunded: 0 });
    expect(rig.poster.reversalCount).toBe(1);
    // The second pass does not even try: a refunded payment no longer matches the query.
    expect(rig.poster.reversalTries).toBe(2);
    expect((await rig.payments.findByIdUnscoped(paymentId))?.status).toBe(
      BillPaymentStatus.REFUNDED,
    );
  });

  it('credits the customer once when two passes run concurrently', async () => {
    const rig = billPayRig();
    const paymentId = await strand(rig);
    passTheThreshold(rig);

    const passes = await Promise.all([
      rig.sweeper.sweep(),
      rig.sweeper.sweep(),
      rig.sweeper.sweep(),
    ]);

    expect(rig.poster.reversalCount).toBe(1);
    expect(passes.reduce((total, pass) => total + pass.refunded, 0)).toBe(1);
    expect((await rig.payments.findByIdUnscoped(paymentId))?.status).toBe(
      BillPaymentStatus.REFUNDED,
    );
  });

  it('says the money is back only once it is', async () => {
    const rig = billPayRig();
    const paymentId = await strand(rig);
    passTheThreshold(rig);

    await rig.sweeper.sweep();

    const settled = await rig.payments.findByIdUnscoped(paymentId);
    expect(settled?.failureReason).toBe(REJECTION_COPY.ACCOUNT_CLOSED);
    expect(settled?.completedAt).not.toBeNull();
  });

  it('leaves a payment alone until the threshold has passed', async () => {
    const rig = billPayRig();
    await strand(rig);

    const result = await rig.sweeper.sweep();

    expect(result).toStrictEqual({ stranded: 0, refunded: 0 });
    expect(rig.poster.reversalCount).toBe(0);
  });

  it('never touches a payment the biller accepted', async () => {
    const rig = billPayRig();
    const payment = await rig.payments.insert(paymentDraft(rig.clock.now()));
    rig.rail.accepts();
    await rig.service.submit(payment.id);
    passTheThreshold(rig);

    const result = await rig.sweeper.sweep();

    expect(result).toStrictEqual({ stranded: 0, refunded: 0 });
    expect(rig.poster.reversalCount).toBe(0);
  });
});

describe('a payment abandoned mid-flight', () => {
  it('is refunded by the sweep once nobody can account for it', async () => {
    const rig = billPayRig();
    const payment = await rig.payments.insert(paymentDraft(rig.clock.now()));
    rig.rail.crashes();

    await expect(rig.service.submit(payment.id)).rejects.toThrow(/biller/u);
    expect((await rig.payments.findByIdUnscoped(payment.id))?.status).toBe(
      BillPaymentStatus.SUBMITTED,
    );

    passTheThreshold(rig);
    const result = await rig.sweeper.sweep();

    expect(result).toStrictEqual({ stranded: 1, refunded: 1 });
    const settled = await rig.payments.findByIdUnscoped(payment.id);
    expect(settled?.status).toBe(BillPaymentStatus.REFUNDED);
    expect(settled?.failureReason).toBe(REJECTION_COPY.NO_RESPONSE);
  });

  it('keeps the refund even when the biller acknowledges afterwards', async () => {
    const rig = billPayRig();
    const payment = await rig.payments.insert(paymentDraft(rig.clock.now()));
    rig.rail.crashes();
    await expect(rig.service.submit(payment.id)).rejects.toThrow(/biller/u);

    passTheThreshold(rig);
    await rig.sweeper.sweep();

    // The rail comes back to life and the retry gets a late acceptance. The money is
    // already home; settling now would book an outflow the customer never authorised twice.
    rig.rail.recovers().accepts('RBLATE0000001');
    const late = await rig.service.submit(payment.id);

    expect(late).toBeNull();
    expect(rig.poster.booked).not.toContain(`settle:${payment.id}`);
    expect((await rig.payments.findByIdUnscoped(payment.id))?.status).toBe(
      BillPaymentStatus.REFUNDED,
    );
  });
});
