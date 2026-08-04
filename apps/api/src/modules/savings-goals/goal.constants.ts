/**
 * The numbers savings goals run on.
 *
 * A savings goal is behavioural rather than financial: nothing here is priced, and the
 * only arithmetic is about whether a customer will get where they said they wanted to be.
 * The constants are therefore about pacing and nudging, not about rates.
 */

/** Basis points in one hundred percent, used for progress and pace figures. */
export const BPS_SCALE = 10_000n;

/**
 * The multiple a card purchase is rounded up to.
 *
 * One pound. Small enough that a customer does not notice it leaving, large enough that it
 * accumulates — which is the entire mechanism. A purchase that lands exactly on the
 * multiple rounds up by nothing, not by a whole pound, because charging someone a pound
 * for spending a round number is a surprise, and surprises get round-ups switched off.
 */
export const ROUND_UP_MULTIPLE_MINOR_UNITS = 100n;

/**
 * The most a single round-up will move.
 *
 * A guard against a currency with a large minor unit or a mis-set multiple sweeping a
 * meaningful sum out of a current account on one transaction.
 */
export const MAX_ROUND_UP_MINOR_UNITS = 99n;

/** A goal is "on track" if the pace needed from here is within this much of the pace so far. */
export const ON_TRACK_TOLERANCE_BPS = 500n;

/** How many goal automations one run will process. Keeps a pass bounded and observable. */
export const AUTOMATION_BATCH_SIZE = 500;

/** Prefix on every ledger reference the savings book writes. */
export const GOAL_REFERENCE_PREFIX = 'GOAL';

/** Mongoose model name for a savings goal and its vault. */
export const GOAL_MODEL = 'SavingsGoal';

/** Physical collection holding savings goals. */
export const GOAL_COLLECTION = 'savings_goals';

/**
 * Transaction labels, so a retry log names the operation that produced the conflict.
 *
 * Every vault movement carries the same label because they are the same unit of work —
 * read the vault, check it, post, write the balance — differing only in direction.
 */
export const GOAL_TRANSACTION_LABEL = {
  VAULT_MOVEMENT: 'goal.vault-movement',
  CLOSE: 'goal.close',
} as const;
