/**
 * Rendering a payment record as a tracking report.
 *
 * The kernel stores facts — when the instruction arrived, what the network answered,
 * which batch it was assigned to, whether a return landed. What those facts *mean* at
 * a given instant is derived here, never stored, so a report is always consistent with
 * the simulated clock it was rendered against. Advancing the clock is what moves a
 * payment from `SUBMITTED` to `SETTLED`; nothing mutates it there.
 */

import {
  RailTrackingState,
  type RailTrackingEntry,
  type RailTrackingReport,
} from '../ports/payment-rail.types.js';

import { RAIL_REASON_CODES } from './kernel.constants.js';
import { type KernelPaymentRecord } from './kernel.types.js';

/** Where the payment stands at `at`, derived from the record's facts. */
export function resolveState(record: KernelPaymentRecord, at: Date): RailTrackingState {
  if (record.acceptance === null) return RailTrackingState.REJECTED;
  if (hasReturned(record, at)) return RailTrackingState.RETURNED;
  if (at.getTime() < transmittedAt(record).getTime()) return RailTrackingState.SUBMITTED;
  if (at.getTime() < record.acceptance.expectedSettlementAt.getTime()) {
    return RailTrackingState.IN_TRANSIT;
  }
  return RailTrackingState.SETTLED;
}

/** The full report the port's `track` returns. */
export function buildReport(record: KernelPaymentRecord, at: Date): RailTrackingReport {
  return {
    instructionId: record.instructionId,
    railReference: record.acceptance?.railReference ?? null,
    state: resolveState(record, at),
    batchId: record.acceptance?.batchId ?? null,
    expectedSettlementAt: record.acceptance?.expectedSettlementAt ?? null,
    returnReasonCode: hasReturned(record, at) ? (record.returnRecord?.reasonCode ?? null) : null,
    timeline: buildTimeline(record, at),
  };
}

/** The history the network will disclose, up to and including `at`. */
function buildTimeline(record: KernelPaymentRecord, at: Date): readonly RailTrackingEntry[] {
  const entries: RailTrackingEntry[] = [
    {
      at: record.submittedAt,
      state: RailTrackingState.SUBMITTED,
      detail: 'Instruction received by the network',
    },
  ];

  if (record.acceptance === null) {
    entries.push(refusalEntry(record));
    return entries;
  }

  entries.push(...acceptanceEntries(record, at));
  return entries;
}

/** The refusal entry closing a rejected instruction's history. */
function refusalEntry(record: KernelPaymentRecord): RailTrackingEntry {
  const refusal = record.refusal;
  return {
    at: transmittedAt(record),
    state: RailTrackingState.REJECTED,
    detail: `Refused by the network: ${refusal?.reasonCode ?? 'UNKNOWN'} — ${refusal?.reason ?? 'no reason given'}`,
  };
}

/** Transmission, settlement and return entries for an accepted payment, as of `at`. */
function acceptanceEntries(record: KernelPaymentRecord, at: Date): RailTrackingEntry[] {
  const acceptance = record.acceptance;
  if (acceptance === null) return [];

  const entries: RailTrackingEntry[] = [];
  if (at.getTime() >= transmittedAt(record).getTime()) {
    entries.push({
      at: transmittedAt(record),
      state: RailTrackingState.IN_TRANSIT,
      detail: `Transmitted to ${record.rail}; assigned to settlement batch ${acceptance.batchId}`,
    });
  }
  if (wasSettledBeforeReturn(record, at)) {
    entries.push({
      at: acceptance.expectedSettlementAt,
      state: RailTrackingState.SETTLED,
      detail: `Settled in batch ${acceptance.batchId} with value date ${acceptance.valueDate}`,
    });
  }
  if (hasReturned(record, at)) entries.push(returnEntry(record));
  return entries;
}

/** The return entry, citing the R-code and its catalogue description. */
function returnEntry(record: KernelPaymentRecord): RailTrackingEntry {
  const returnRecord = record.returnRecord;
  const reason = RAIL_REASON_CODES.find((entry) => entry.code === returnRecord?.reasonCode);
  const narrative = returnRecord?.detail ?? reason?.description ?? 'returned by the receiving bank';
  return {
    at: returnRecord?.returnedAt ?? record.submittedAt,
    state: RailTrackingState.RETURNED,
    detail: `Returned ${returnRecord?.reasonCode ?? ''}: ${narrative}`,
  };
}

/** Whether the return has landed by `at`. */
function hasReturned(record: KernelPaymentRecord, at: Date): boolean {
  return record.returnRecord !== null && at.getTime() >= record.returnRecord.returnedAt.getTime();
}

/** Settlement is only history once its instant passes — and only if no earlier return pre-empted it. */
function wasSettledBeforeReturn(record: KernelPaymentRecord, at: Date): boolean {
  const acceptance = record.acceptance;
  if (acceptance === null) return false;
  if (at.getTime() < acceptance.expectedSettlementAt.getTime()) return false;
  if (record.returnRecord === null) return true;
  return record.returnRecord.returnedAt.getTime() >= acceptance.expectedSettlementAt.getTime();
}

/** The instant the network finished answering — submission plus the reported latency. */
function transmittedAt(record: KernelPaymentRecord): Date {
  const latencyMs = record.acceptance?.latencyMs ?? record.refusal?.latencyMs ?? 0;
  return new Date(record.submittedAt.getTime() + latencyMs);
}
