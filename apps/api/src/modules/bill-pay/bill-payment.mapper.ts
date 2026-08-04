import { type BillPayment } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { toIso } from '../accounts/index.js';

import { type BillPaymentRecord } from './bill-payment.store.js';

/**
 * A payment record, projected onto the wire.
 *
 * Four fields are deliberately not projected. `userId`, because echoing the owner's id back
 * to the owner tells them nothing. And the three internal journal ids — settlement,
 * reversal and fee — because the contract models a payment as having one entry, and how the
 * bank books its own in-flight liability is not the customer's concern. What they do get is
 * `transactionId`: the statement line they can actually go and look at.
 */
export function toContractBillPayment(record: BillPaymentRecord): BillPayment {
  return {
    id: record.id,
    billerId: record.billerId,
    billerName: record.billerName,
    status: record.status,
    sourceAccountId: record.sourceAccountId,
    customerReference: record.customerReference,
    amount: toWireMoney(record.amount),
    fee: toWireMoney(record.fee),
    billerReceipt: record.billerReceipt,
    failureReason: record.failureReason,
    transactionId: record.transactionId,
    createdAt: toIso(record.createdAt),
    completedAt: record.completedAt ? toIso(record.completedAt) : null,
  };
}

/**
 * Stored money to wire money.
 *
 * The two shapes are identical by design — see `money.codec.ts` — so this widens the
 * currency's type rather than converting anything.
 */
function toWireMoney(stored: StoredMoney): BillPayment['amount'] {
  return { amount: stored.amount, currency: stored.currency as BillPayment['amount']['currency'] };
}
