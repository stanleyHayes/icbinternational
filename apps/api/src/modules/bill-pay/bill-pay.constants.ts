/**
 * Names, limits and copy shared across bill payment.
 *
 * The two decisions worth stating out loud live here. **The fee is charged on completion,
 * never on submission** — a customer must not pay to have a payment fail. And **a payment
 * is submitted by a job, not by the request that created it** — the request's job is to
 * take the money safely and answer quickly; talking to a third party that may take thirty
 * seconds to say nothing is not something a customer should be made to wait for.
 */

import { type BillerRejection } from '../../rails/biller/index.js';

/** Mongoose model name for a bill payment or top-up. */
export const BILL_PAYMENT_MODEL = 'BillPayment';

/** Physical collection holding bill payments and top-ups. */
export const BILL_PAYMENT_COLLECTION = 'bill_payments';

/** Mongoose model name for the seeded biller directory. */
export const BILLER_MODEL = 'Biller';

/** Physical collection the foundation seed writes the directory into. */
export const BILLER_COLLECTION = 'billers';

/** Job name for submitting a payment to the biller network. */
export const BILL_SUBMISSION_JOB = 'billpay.submit';

/** Job name for the sweep that finishes a refund whose first attempt did not land. */
export const BILL_REFUND_SWEEP_JOB = 'billpay.refund-sweep';

/**
 * How often the refund sweep runs, in real milliseconds.
 *
 * Wall time, not business time: BullMQ schedules against Redis, which cannot see the bank's
 * clock. What the sweep *decides* is business time — see {@link REFUND_STRANDED_AFTER_MS}.
 */
export const REFUND_SWEEP_INTERVAL_MS = 300_000;

/**
 * How long a payment may sit owing a refund before the sweep takes it over.
 *
 * Fifteen minutes, measured on the bank's clock against `submittedAt`. Long enough that no
 * live rail call is ever mistaken for a stranded one — the slowest timeout the network can
 * produce is thirty seconds — and short enough that a customer who has been debited is not
 * left short for a working day because a reversal transaction lost its connection.
 */
export const REFUND_STRANDED_AFTER_MS = 900_000;

/** Payments one sweep pass will take on. Bounded so a backlog cannot monopolise a worker. */
export const REFUND_SWEEP_BATCH_SIZE = 100;

/**
 * Attempts a submission gets before it is abandoned and reversed.
 *
 * Two, not five. Each attempt draws a fresh decision from the network, so a transient
 * silence is retried once — but a customer whose money is sitting in a suspense account
 * while the bank keeps knocking is worse off than a customer who has been refunded and
 * told. Beyond this the money goes back.
 */
export const MAX_SUBMISSION_ATTEMPTS = 2;

/** Delay before the retry, in milliseconds. */
export const RETRY_DELAY_MS = 5_000;

/** Journal reference prefixes, derived from the payment id so each entry is unique. */
export const BILL_REFERENCE_PREFIX = 'bill:';
export const BILL_SETTLEMENT_PREFIX = 'bill-settle:';
export const BILL_REVERSAL_PREFIX = 'bill-reverse:';
export const BILL_FEE_PREFIX = 'bill-fee:';

/** Narrative on the fee line. Customers see this on their statement. */
export const BILL_FEE_DESCRIPTION = 'Bill payment fee';

/** Narrative on the reversal line. */
export const BILL_REVERSAL_DESCRIPTION = 'Payment returned — refunded in full';

/** Longest customer reference the directory patterns can require. */
export const MAX_CUSTOMER_REFERENCE = 40;

/** Directory page size when the client does not ask for one. */
export const BILLER_PAGE_SIZE = 25;

/** Payments returned by the customer's list when no limit is given. */
export const BILL_PAYMENT_PAGE_SIZE = 25;

/**
 * How a refusal is worded **while the money is still on its way back**.
 *
 * A payment sits in `REJECTED` from the moment the biller says no until the reversal has
 * actually been booked, and those two moments are not always the same one — a reversal whose
 * transaction fails leaves the payment here for the sweep to finish. So none of this copy
 * says the money is back, because at the instant it is shown it is not. Telling a customer
 * their refund has landed when it has not is worse than telling them nothing: they go and
 * look, find no credit, and stop believing the next thing the bank tells them.
 */
export const REFUSAL_COPY = {
  UNKNOWN_ACCOUNT:
    'The biller does not recognise that account number. We are returning the money to your account.',
  ACCOUNT_CLOSED:
    'The biller has closed that account. We are returning the money to your account — check with them for a new reference.',
  AMOUNT_NOT_ACCEPTED:
    'The biller would not accept a payment of that amount. We are returning the money to your account.',
  DUPLICATE_SUSPECTED:
    'The biller believes this payment has already been made. We are returning the money to your account.',
  BILLER_SYSTEM_ERROR:
    'The biller could not process the payment. We are returning the money to your account, and you can try again later.',
  NO_RESPONSE:
    'We did not get an answer from the biller in time. We are returning the money to your account, and you can try again.',
} as const satisfies Record<BillerRejection, string>;

/**
 * How the customer's failure is worded once the refund has genuinely been booked.
 *
 * Written onto the payment in the same transaction as the reversal entry, so the sentence
 * and the credit become true together or neither does.
 */
export const REJECTION_COPY = {
  UNKNOWN_ACCOUNT:
    'The biller does not recognise that account number, so we have put the money back.',
  ACCOUNT_CLOSED:
    'The biller has closed that account, so we have put the money back. Check with them for a new reference.',
  AMOUNT_NOT_ACCEPTED:
    'The biller would not accept a payment of that amount, so we have put the money back.',
  DUPLICATE_SUSPECTED:
    'The biller believes this payment has already been made, so we have put the money back.',
  BILLER_SYSTEM_ERROR:
    'The biller could not process the payment, so we have put the money back. Please try again later.',
  NO_RESPONSE:
    'We did not get an answer from the biller in time, so we have put the money back. Please try again.',
} as const satisfies Record<BillerRejection, string>;
