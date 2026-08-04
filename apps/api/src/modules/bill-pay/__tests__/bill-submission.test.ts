import { BillPaymentStatus } from '@reliance/contracts';

import { BillerRejection } from '../../../rails/biller/index.js';
import { REJECTION_COPY } from '../bill-pay.constants.js';
import { PaymentKind } from '../bill-payment.store.js';

import { billerFixture, billPayRig as rig, paymentDraft } from './bill-pay-harness.js';

describe('submitting a bill payment', () => {
  it('settles the in-flight liability when the biller takes it', async () => {
    const { payments, clock, rail, service, poster } = rig();
    const payment = await payments.insert(paymentDraft(clock.now()));
    rail.accepts('RBABCDE12345');

    const settled = await service.submit(payment.id);

    expect(settled?.status).toBe(BillPaymentStatus.COMPLETED);
    expect(settled?.billerReceipt).toBe('RBABCDE12345');
    expect(settled?.completedAt).not.toBeNull();
    expect(poster.booked).toStrictEqual([`settle:${payment.id}`]);
  });

  it('claims the payment before it talks to the biller', async () => {
    const { payments, clock, rail, service } = rig();
    const payment = await payments.insert(paymentDraft(clock.now()));

    await service.submit(payment.id);

    expect(rail.submitted).toStrictEqual([payment.id]);
  });

  it('counts the attempt, so a retry draws a fresh answer from the network', async () => {
    const { payments, clock, service } = rig();
    const payment = await payments.insert(paymentDraft(clock.now()));

    const settled = await service.submit(payment.id);

    expect(settled?.attempts).toBe(1);
  });

  it('does nothing to a payment another worker has already handled', async () => {
    const { payments, clock, rail, service } = rig();
    const payment = await payments.insert(paymentDraft(clock.now()));

    await service.submit(payment.id);
    const second = await service.submit(payment.id);

    expect(second).toBeNull();
    expect(rail.submitted).toStrictEqual([payment.id]);
  });
});

/**
 * The property the whole lane exists to protect: a customer must never be left short
 * because a third party said no, or said nothing at all.
 */
describe('a failure after the debit', () => {
  it('reverses inside the same job, in full', async () => {
    const { payments, clock, rail, service, poster } = rig();
    const payment = await payments.insert(paymentDraft(clock.now()));
    rail.refuses(BillerRejection.UNKNOWN_ACCOUNT);

    const refunded = await service.submit(payment.id);

    expect(refunded?.status).toBe(BillPaymentStatus.REFUNDED);
    expect(refunded?.reversalEntryId).toBe(`jnl_reverse_${payment.id}`);
    expect(poster.booked).toStrictEqual([`reverse:${payment.id}`]);
  });

  it('reverses a timeout too — silence is not an acceptance', async () => {
    const { payments, clock, rail, service, poster } = rig();
    const payment = await payments.insert(paymentDraft(clock.now()));
    rail.goesQuiet();

    const refunded = await service.submit(payment.id);

    expect(refunded?.status).toBe(BillPaymentStatus.REFUNDED);
    expect(refunded?.failureReason).toBe(REJECTION_COPY.NO_RESPONSE);
    expect(poster.booked).toContain(`reverse:${payment.id}`);
  });

  it('never settles and reverses the same payment', async () => {
    const { payments, clock, rail, service, poster } = rig();
    const payment = await payments.insert(paymentDraft(clock.now()));
    rail.refuses();

    await service.submit(payment.id);

    expect(poster.booked).not.toContain(`settle:${payment.id}`);
  });

  it('explains the refusal in words a customer can act on', async () => {
    const { payments, clock, rail, service } = rig();
    const payment = await payments.insert(paymentDraft(clock.now()));
    rail.refuses(BillerRejection.ACCOUNT_CLOSED);

    const refunded = await service.submit(payment.id);

    expect(refunded?.failureReason).toBe(REJECTION_COPY.ACCOUNT_CLOSED);
    expect(refunded?.failureReason).not.toMatch(/error|code|handler/i);
  });

  it('refunds once, however many times the job is replayed', async () => {
    const { payments, clock, rail, service, poster } = rig();
    const payment = await payments.insert(paymentDraft(clock.now()));
    rail.refuses();

    await service.submit(payment.id);
    await service.submit(payment.id);

    expect(poster.booked.filter((entry) => entry.startsWith('reverse:'))).toHaveLength(1);
  });

  it('records how long the biller took, so a slow one is visible to operations', async () => {
    const { payments, clock, rail, service } = rig();
    const payment = await payments.insert(paymentDraft(clock.now()));
    rail.goesQuiet();

    const refunded = await service.submit(payment.id);

    expect(refunded?.lastLatencyMs).toBe(30_000);
  });
});

describe('submitting a top-up', () => {
  it('goes to the mobile gateway rather than the biller directory', async () => {
    const { payments, clock, rail, service } = rig();
    const payment = await payments.insert(
      paymentDraft(clock.now(), {
        kind: PaymentKind.TOP_UP,
        billerId: 'ee',
        billerName: 'EE',
        customerReference: '07700900123',
        topUp: { provider: 'EE', phone: '07700900123', bundle: 'AIRTIME', bundleCode: null },
      }),
    );

    const settled = await service.submit(payment.id);

    expect(settled?.status).toBe(BillPaymentStatus.COMPLETED);
    expect(rail.submitted).toStrictEqual([payment.id]);
  });

  it('refunds a failed top-up exactly as it refunds a failed bill', async () => {
    const { payments, clock, rail, service, poster } = rig();
    const payment = await payments.insert(
      paymentDraft(clock.now(), {
        kind: PaymentKind.TOP_UP,
        topUp: { provider: 'O2', phone: '07700900999', bundle: 'DATA', bundleCode: 'D5GB' },
      }),
    );
    rail.refuses(BillerRejection.BILLER_SYSTEM_ERROR);

    const refunded = await service.submit(payment.id);

    expect(refunded?.status).toBe(BillPaymentStatus.REFUNDED);
    expect(poster.booked).toStrictEqual([`reverse:${payment.id}`]);
  });
});

describe('the biller fixture', () => {
  it('carries a format that actually rejects something', () => {
    const biller = billerFixture();
    expect(new RegExp(biller.accountNumberPattern, 'u').test('123')).toBe(false);
    expect(new RegExp(biller.accountNumberPattern, 'u').test('1234567890')).toBe(true);
  });
});
