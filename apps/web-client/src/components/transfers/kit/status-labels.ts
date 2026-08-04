/**
 * Machine statuses, in the words a customer would use.
 *
 * `SUBMITTED` is a state in a ledger; "On its way" is what somebody wants to read about their rent.
 * Every status also carries a tone, and every tone is paired with a word — colour is never the only
 * thing distinguishing "settled" from "returned".
 */

import {
  BillPaymentStatus,
  MandateStatus,
  PaymentRequestStatus,
  TransferOrderStatus,
  TransferRail,
  TransferStatus,
} from '@reliance/contracts';
import type { Tone } from '@reliance/ui';

/** A status as the customer reads it. */
export interface StatusLook {
  readonly label: string;
  readonly tone: Tone;
}

/** Where a payment has got to. */
export const TRANSFER_STATUS: Readonly<Record<TransferStatus, StatusLook>> = {
  [TransferStatus.DRAFT]: { label: 'Not sent', tone: 'neutral' },
  [TransferStatus.AWAITING_APPROVAL]: { label: 'Waiting for approval', tone: 'pending' },
  [TransferStatus.SCHEDULED]: { label: 'Scheduled', tone: 'info' },
  [TransferStatus.PENDING]: { label: 'Being prepared', tone: 'pending' },
  [TransferStatus.SUBMITTED]: { label: 'On its way', tone: 'pending' },
  [TransferStatus.SETTLED]: { label: 'Delivered', tone: 'credit' },
  [TransferStatus.RETURNED]: { label: 'Returned to you', tone: 'warning' },
  [TransferStatus.REJECTED]: { label: 'Refused', tone: 'danger' },
  [TransferStatus.CANCELLED]: { label: 'Cancelled', tone: 'neutral' },
  [TransferStatus.FAILED]: { label: 'Could not be sent', tone: 'danger' },
};

/** Statuses where the money has not yet left the bank, so cancelling is still possible. */
export const CANCELLABLE_TRANSFER: ReadonlySet<TransferStatus> = new Set([
  TransferStatus.DRAFT,
  TransferStatus.SCHEDULED,
  TransferStatus.AWAITING_APPROVAL,
  TransferStatus.PENDING,
]);

/** How each rail is described, and how long it usually takes. */
export const RAIL_LOOK: Readonly<Record<TransferRail, { name: string; speed: string }>> = {
  [TransferRail.INTERNAL]: {
    name: 'Between Reliance accounts',
    speed: 'Arrives straight away',
  },
  [TransferRail.DOMESTIC_ACH]: {
    name: 'Standard bank transfer',
    speed: 'Usually within two hours, and always by the next working day',
  },
  [TransferRail.DOMESTIC_RTGS]: {
    name: 'Same-day bank transfer',
    speed: 'Arrives the same working day, before the cut-off',
  },
  [TransferRail.INTERNATIONAL_SWIFT]: {
    name: 'International payment',
    speed: 'Usually one to three working days, depending on the receiving bank',
  },
};

/** Whether a standing order is running. */
export const ORDER_STATUS: Readonly<Record<TransferOrderStatus, StatusLook>> = {
  [TransferOrderStatus.ACTIVE]: { label: 'Running', tone: 'credit' },
  [TransferOrderStatus.PAUSED]: { label: 'Paused', tone: 'pending' },
  [TransferOrderStatus.COMPLETED]: { label: 'Finished', tone: 'neutral' },
  [TransferOrderStatus.CANCELLED]: { label: 'Cancelled', tone: 'neutral' },
  [TransferOrderStatus.FAILING]: { label: 'Payments are failing', tone: 'danger' },
};

/** Where a bill payment has got to. */
export const BILL_STATUS: Readonly<Record<BillPaymentStatus, StatusLook>> = {
  [BillPaymentStatus.PENDING]: { label: 'Being prepared', tone: 'pending' },
  [BillPaymentStatus.SUBMITTED]: { label: 'Sent to the biller', tone: 'pending' },
  [BillPaymentStatus.COMPLETED]: { label: 'Paid', tone: 'credit' },
  [BillPaymentStatus.REJECTED]: { label: 'Refused by the biller', tone: 'danger' },
  [BillPaymentStatus.REFUNDED]: { label: 'Refunded to you', tone: 'info' },
};

/** Whether a request for money has been settled. */
export const REQUEST_STATUS: Readonly<Record<PaymentRequestStatus, StatusLook>> = {
  [PaymentRequestStatus.OPEN]: { label: 'Waiting to be paid', tone: 'pending' },
  [PaymentRequestStatus.PAID]: { label: 'Paid', tone: 'credit' },
  [PaymentRequestStatus.DECLINED]: { label: 'Declined', tone: 'warning' },
  [PaymentRequestStatus.EXPIRED]: { label: 'Expired', tone: 'neutral' },
  [PaymentRequestStatus.CANCELLED]: { label: 'Cancelled', tone: 'neutral' },
};

/** Whether a merchant can still collect under a direct debit. */
export const MANDATE_STATUS: Readonly<Record<MandateStatus, StatusLook>> = {
  [MandateStatus.ACTIVE]: { label: 'Active', tone: 'credit' },
  [MandateStatus.PAUSED]: { label: 'Paused', tone: 'pending' },
  [MandateStatus.CANCELLED]: { label: 'Cancelled', tone: 'neutral' },
  [MandateStatus.EXPIRED]: { label: 'Expired', tone: 'neutral' },
};
