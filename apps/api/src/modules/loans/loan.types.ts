/**
 * Types the lending module owns that the frozen contract does not name.
 *
 * The contract describes what crosses the wire. A few concepts — arrears buckets, the
 * state of a payment arrangement, the shape of a restructure — exist entirely inside the
 * bank and have no wire representation, so they are declared here rather than being
 * smuggled into the contract or spelled as bare strings at the call sites.
 *
 * Contract types the module uses widely are re-exported so a consumer has one import.
 */

import { type Money } from '@reliance/money';

export {
  LoanApplicationStatus,
  LoanKind,
  LoanStatus,
  type AmortisationRow,
  type Loan,
  type LoanApplication,
  type LoanEligibility,
  type LoanProduct,
  type LoanQuote,
  type PayoffQuote,
} from '@reliance/contracts';

/**
 * Days-past-due buckets, the regulatory grouping arrears are reported and provisioned in.
 *
 * The boundaries are the standard 30/60/90 and are not negotiable: they are what the
 * bank's impairment policy, its regulatory returns and its credit-risk reporting are all
 * defined against, so a fourth boundary invented locally would be wrong in three places.
 */
export const DpdBucket = {
  CURRENT: 'CURRENT',
  DPD_1_29: 'DPD_1_29',
  DPD_30_59: 'DPD_30_59',
  DPD_60_89: 'DPD_60_89',
  DPD_90_PLUS: 'DPD_90_PLUS',
} as const;
export type DpdBucket = (typeof DpdBucket)[keyof typeof DpdBucket];

/** Where an agreed arrangement to clear arrears has got to. */
export const PaymentPlanStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  BROKEN: 'BROKEN',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentPlanStatus = (typeof PaymentPlanStatus)[keyof typeof PaymentPlanStatus];

/** A customer's arrears position, as the collections screen and the admin list show it. */
export interface ArrearsPosition {
  readonly loanId: string;
  readonly userId: string;
  readonly daysPastDue: number;
  readonly bucket: DpdBucket;
  /** Everything overdue: missed instalments plus the late fees charged on them. */
  readonly arrearsAmount: Money;
  readonly missedInstalments: number;
  /** Loss allowance the bucket calls for against the outstanding balance. */
  readonly requiredProvision: Money;
}
