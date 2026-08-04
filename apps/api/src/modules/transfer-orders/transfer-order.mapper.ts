import { type TransferOrder } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { toIso } from '../accounts/index.js';

import { type Schedule } from './transfer-order.schedule.js';
import { type TransferOrderRecord } from './transfer-order.store.js';

/**
 * A stored standing order, on the wire.
 *
 * `nextRunAt` is published as a full timestamp because the contract types it as one, but
 * it is always midnight UTC on a calendar date: a standing order runs on a day the
 * customer chose, and the client renders it as a date. Anything more precise would be
 * inventing a time the bank never promised.
 */
export function toContractTransferOrder(record: TransferOrderRecord): TransferOrder {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    sourceAccountId: record.sourceAccountId,
    beneficiaryId: record.beneficiaryId,
    amount: toWireMoney(record.amount),
    reference: record.reference,
    frequency: record.frequency,
    dayOfMonth: record.dayOfMonth,
    dayOfWeek: record.dayOfWeek,
    startsOn: record.startsOn,
    endsOn: record.endsOn,
    maxOccurrences: record.maxOccurrences,
    occurrencesRun: record.occurrencesRun,
    nextRunAt: record.nextRunAt ? toIso(record.nextRunAt) : null,
    lastRunAt: record.lastRunAt ? toIso(record.lastRunAt) : null,
    consecutiveFailures: record.consecutiveFailures,
    createdAt: toIso(record.createdAt),
  };
}

/** The recurrence rule held on a record, in the shape the schedule arithmetic reads. */
export function scheduleOf(
  record: TransferOrderRecord,
  overrides: Partial<Schedule> = {},
): Schedule {
  return {
    frequency: record.frequency,
    dayOfMonth: record.dayOfMonth,
    dayOfWeek: record.dayOfWeek,
    startsOn: record.startsOn,
    endsOn: record.endsOn,
    maxOccurrences: record.maxOccurrences,
    ...overrides,
  };
}

/**
 * Stored money to wire money.
 *
 * The two shapes are identical by design — see `money.codec.ts` — so this widens the
 * currency's type rather than converting anything.
 */
function toWireMoney(stored: StoredMoney): TransferOrder['amount'] {
  return {
    amount: stored.amount,
    currency: stored.currency as TransferOrder['amount']['currency'],
  };
}
