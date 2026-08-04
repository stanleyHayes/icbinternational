import { type Money } from '@reliance/money';

/**
 * The shape of the answer to "has the ledger drifted?".
 *
 * Every monetary figure in the report is a minor-unit string rather than a `Money`,
 * because a report is written to a log, a CI annotation and an ops dashboard, and each of
 * those is a JSON boundary where a `Money` would become `{}` or a lossy float.
 */

/** One rebuilt balance: what the postings say a target should hold in one currency. */
export interface ReplayedBalance {
  /** GL code or customer account id, depending on which side of the diff it came from. */
  readonly target: string;
  readonly currency: string;
  readonly balance: Money;
}

/** A stored projection that disagrees with the replay. Every one of these is an incident. */
export interface BalanceDrift {
  readonly scope: DriftScope;
  readonly target: string;
  readonly currency: string;
  /** What replaying every posting produces. */
  readonly expected: string;
  /** What the stored projection actually holds. `null` when the record is missing. */
  readonly actual: string | null;
  /** `actual - expected`, in minor units. Null actual is reported as the full expected. */
  readonly difference: string;
}

export const DriftScope = {
  LEDGER_ACCOUNT: 'LEDGER_ACCOUNT',
  CUSTOMER_ACCOUNT: 'CUSTOMER_ACCOUNT',
} as const;
export type DriftScope = (typeof DriftScope)[keyof typeof DriftScope];

/** An entry whose stored postings no longer balance. Means the bytes were tampered with. */
export interface UnbalancedEntryFinding {
  readonly entryId: string;
  readonly reference: string;
  readonly currency: string;
  readonly debits: string;
  readonly credits: string;
}

/** Trial balance derived from the replay rather than from the stored projection. */
export interface TrialBalanceCheck {
  readonly currency: string;
  readonly totalDebits: string;
  readonly totalCredits: string;
  readonly difference: string;
  readonly balanced: boolean;
}

/**
 * `SUM(customer balances) === balance of GL 2000` — per currency.
 *
 * The bank's defining identity. It can fail even when no individual balance has drifted,
 * if a posting reached the control account without naming a customer, so it is checked
 * separately rather than inferred from the absence of other findings.
 */
export interface ControlTotalCheck {
  readonly currency: string;
  readonly customerDepositsTotal: string;
  readonly controlAccountBalance: string;
  readonly difference: string;
  readonly matched: boolean;
}

export interface LedgerVerificationReport {
  /** Simulated clock time the verification ran at. */
  readonly asOf: string;
  readonly entriesScanned: number;
  /** True when every check passed. This is the value `pnpm ledger:verify` exits on. */
  readonly healthy: boolean;
  readonly unbalancedEntries: readonly UnbalancedEntryFinding[];
  readonly ledgerAccountDrift: readonly BalanceDrift[];
  readonly customerAccountDrift: readonly BalanceDrift[];
  readonly trialBalance: readonly TrialBalanceCheck[];
  readonly controlTotals: readonly ControlTotalCheck[];
}
