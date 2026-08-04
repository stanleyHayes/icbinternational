/**
 * How the disputes module tells the customer something.
 *
 * A narrow port over the notification platform: the services speak dispute vocabulary
 * ("raised", "updated", "resolved") and the adapter owns the template keys and prop
 * shaping. Tests bind an in-memory adapter and assert on what the customer was told.
 */
export abstract class DisputeNotifier {
  /** The case is open and, where credit was given, the money is back provisionally. */
  abstract disputeRaised(input: DisputeRaisedNotice): Promise<void>;

  /** The case moved — typically the merchant's answer arriving. */
  abstract disputeUpdated(input: DisputeUpdatedNotice): Promise<void>;

  /** Final outcome. Urgent by template — a lost dispute takes money back. */
  abstract disputeResolved(input: DisputeResolvedNotice): Promise<void>;
}

/** Props for the raised notification. */
export interface DisputeRaisedNotice {
  readonly userId: string;
  readonly reference: string;
  readonly merchantName: string;
  readonly amountFormatted: string;
  readonly decisionBy: string;
}

/** Props for a mid-case update. */
export interface DisputeUpdatedNotice {
  readonly userId: string;
  readonly reference: string;
  readonly stage: string;
  readonly whatWeNeed: string;
  readonly nextUpdateBy: string;
}

/** Props for the outcome notification. */
export interface DisputeResolvedNotice {
  readonly userId: string;
  readonly reference: string;
  readonly amountFormatted: string;
  /** True when the dispute was won — the credit becomes permanent. */
  readonly upheld: boolean;
  readonly explanation: string;
}
