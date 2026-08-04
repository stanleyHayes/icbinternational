import { type MoneyJSON } from '@reliance/money';

/**
 * The vocabulary of the bill-payment network.
 *
 * These types are the boundary a real rail would expose: a submission goes out, an
 * acknowledgement or a rejection comes back, and the bank has to be able to act on either
 * without knowing anything about who is on the other end.
 */

/** Why the biller refused a payment. Codes, not prose — the copy is chosen by the bank. */
export const BillerRejection = {
  /** The reference does not correspond to an account the biller holds. */
  UNKNOWN_ACCOUNT: 'UNKNOWN_ACCOUNT',
  /** The account exists but the biller has closed it. */
  ACCOUNT_CLOSED: 'ACCOUNT_CLOSED',
  /** The biller will not take a payment of this size against this account. */
  AMOUNT_NOT_ACCEPTED: 'AMOUNT_NOT_ACCEPTED',
  /** The biller believes it has already taken this payment. */
  DUPLICATE_SUSPECTED: 'DUPLICATE_SUSPECTED',
  /** The biller's systems answered, but with an error of their own. */
  BILLER_SYSTEM_ERROR: 'BILLER_SYSTEM_ERROR',
  /** Nothing came back inside the window. Distinct from a refusal — see the rail docs. */
  NO_RESPONSE: 'NO_RESPONSE',
} as const;
export type BillerRejection = (typeof BillerRejection)[keyof typeof BillerRejection];

/** What the bank sends to the network for one bill payment. */
export interface BillerSubmission {
  /** The bank's own identifier for this payment. Stable across retries of one attempt. */
  readonly paymentId: string;
  readonly billerId: string;
  readonly billerName: string;
  /** The customer's account number or reference with the biller. */
  readonly customerReference: string;
  readonly amount: MoneyJSON;
  /** Which attempt this is, counting from one. Retries get a fresh network decision. */
  readonly attempt: number;
}

/** What the bank sends to the network for an airtime or data top-up. */
export interface TopUpSubmission {
  readonly paymentId: string;
  readonly provider: string;
  /** Handset the credit lands on. */
  readonly phone: string;
  readonly bundle: 'AIRTIME' | 'DATA';
  readonly bundleCode: string | null;
  readonly amount: MoneyJSON;
  readonly attempt: number;
}

/** The network accepted the payment and issued proof of it. */
export interface BillerAccepted {
  readonly accepted: true;
  /** The customer's proof of payment. Quoted back to the biller in any dispute. */
  readonly receipt: string;
  /** How long the network took to answer. Recorded for operations, not shown as-is. */
  readonly latencyMs: number;
}

/** The network refused, or never answered. Either way the debit must be undone. */
export interface BillerRefused {
  readonly accepted: false;
  readonly rejection: BillerRejection;
  readonly latencyMs: number;
}

export type BillerOutcome = BillerAccepted | BillerRefused;

/** The answer to "does this reference exist, and whose is it?", asked before any debit. */
export interface BillerAccountCheck {
  readonly valid: boolean;
  /** The name the biller holds against the reference, when it will disclose one. */
  readonly accountName: string | null;
  /** Set when `valid` is false. */
  readonly rejection: BillerRejection | null;
}
