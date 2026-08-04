/**
 * Names, batch sizes and copy for standing orders.
 *
 * A standing order is the customer's instruction, not the bank's: they choose the amount,
 * the day and the end, and they can stop it without asking. The numbers here are storage
 * and paging concerns only — none of them limits what a customer may set up.
 */

/** Mongoose model name for a standing order. */
export const TRANSFER_ORDER_MODEL = 'TransferOrder';

/** Physical collection holding standing orders. */
export const TRANSFER_ORDER_COLLECTION = 'transfer_orders';

/** Audit entity family for every event the controller emits. */
export const TRANSFER_ORDER_AUDIT_ENTITY = 'transfer-order';

/**
 * What the customer is told is missing when an id is not theirs.
 *
 * Deliberately the same phrase whether the order belongs to someone else or does not
 * exist. A 403 on the first case and a 404 on the second would let anyone holding a list
 * of ids learn which ones are real.
 */
export const TRANSFER_ORDER_LABEL = 'That standing order';

/** Newest-first sort direction, spelled once so a `-1` in a sort is never a mystery. */
export const NEWEST_FIRST = -1;

/**
 * Standing orders the run sweep claims in one pass.
 *
 * Sized for the whole bank's daily due list rather than one customer's: month-ends
 * concentrate rent and subscriptions onto a handful of dates, so the batch has to absorb
 * a spike without needing a second pass.
 */
export const TRANSFER_ORDER_RUN_BATCH = 500;
