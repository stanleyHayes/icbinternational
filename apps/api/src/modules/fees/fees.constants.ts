import { type FeeKind } from '@reliance/contracts';

/**
 * Names, tokens and thresholds shared across the fees module.
 *
 * They live in one file because each is a coupling point: a reference prefix is written
 * by the poster and matched by reconciliation, and a charge key is built by two services
 * that must never disagree about its shape.
 */

/** Mongoose model name for a fee charge record. */
export const FEE_CHARGE_MODEL = 'FeeCharge';

/** Physical collection holding assessed fee charges. */
export const FEE_CHARGE_COLLECTION = 'fee_charges';

/**
 * Read-only model the maintenance sweep scans chargeable accounts through.
 *
 * A second model over the accounts collection (the gl module sets the precedent for the
 * ledger's collections) because `AccountStore` deliberately offers no whole-population
 * scan, and this module may not edit the accounts lane to add one.
 */
export const CHARGEABLE_ACCOUNT_MODEL = 'FeesChargeableAccount';

/** Read-only model reconciliation reads the journal through. */
export const FEE_JOURNAL_READ_MODEL = 'FeesJournalEntry';

/** Every journal entry this module books carries this reference prefix. */
export const FEE_REFERENCE_PREFIX = 'FEE-';

/**
 * Public-id prefix for a fee charge record.
 *
 * Minted locally (`fee_<ulid>`) because the frozen contracts have no `fee` entity kind;
 * a contract-change proposal asks for one, at which point `IdGenerator` takes over.
 */
export const FEE_ID_PREFIX = 'fee';

/** What triggered a charge: the monthly schedule, or a discrete billable event. */
export const FeeChargeSource = {
  SCHEDULED: 'SCHEDULED',
  EVENT: 'EVENT',
} as const;
export type FeeChargeSource = (typeof FeeChargeSource)[keyof typeof FeeChargeSource];

/** Job name on the scheduler queue for the monthly maintenance sweep. */
export const MAINTENANCE_JOB_NAME = 'fees:monthly-maintenance';

/**
 * How often the maintenance sweep wakes, in wall-clock milliseconds.
 *
 * BullMQ schedules on real time; which month is due is decided from `ClockService`
 * inside the sweep, so an hourly wake is cheap and a simulated month is never missed.
 */
export const MAINTENANCE_SWEEP_INTERVAL_MS = 3_600_000;

/** Accounts scanned per batch during the maintenance sweep. */
export const SWEEP_BATCH_SIZE = 500;

/** Transaction-runner log label for one fee booking. */
export const FEE_TRANSACTION_LABEL = 'fees.charge';

/**
 * The dedupe key for a period-driven charge: one per account, fee kind and period.
 *
 * Enforced by a unique index, so a retried sweep can never charge the same month twice.
 */
export function scheduledChargeKey(kind: FeeKind, accountId: string, periodKey: string): string {
  return `${kind}:${accountId}:${periodKey}`;
}

/**
 * The dedupe key for an event-driven charge, e.g. one ATM withdrawal or one late payment.
 *
 * `sourceId` is the caller's stable identifier for the billable event (a card
 * authorisation id, a transfer quote id), which is what makes a retried caller safe.
 */
export function eventChargeKey(kind: FeeKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}
