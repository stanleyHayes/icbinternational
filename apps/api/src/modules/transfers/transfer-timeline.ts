import { TransferStatus, type Transfer } from '@reliance/contracts';

import { toIso } from '../accounts/index.js';

/**
 * A transfer's status history, as an append-only list.
 *
 * The timeline is not decoration. "Where is my money?" is the single most common question
 * a bank is asked, and the only honest answer is a record of what happened and when. It is
 * therefore appended to rather than overwritten: a transfer that went `PENDING → SETTLED`
 * and one that went `PENDING → RETURNED → PENDING → SETTLED` end in the same status and
 * are not the same event, and only the history distinguishes them.
 *
 * Statuses are never rewritten in place. The current status is the last event's status,
 * denormalised onto the document for indexing — see `transfer.schema.ts`.
 */

/** One entry on a transfer's timeline. */
export interface TimelineEntry {
  readonly status: TransferStatus;
  readonly at: Date;
  readonly detail: string;
}

/** The detail lines used by the internal rail, phrased for a customer to read. */
export const TIMELINE_DETAIL = {
  submitted: 'Payment authorised and sent',
  settled: 'Money delivered to the payee',
  cancelled: 'Cancelled before it was sent',
  failed: 'The payment could not be completed',
} as const;

/**
 * One timeline entry in the wire shape.
 *
 * Derived from `transferSchema` rather than imported: the contract exports
 * `transferEventSchema` as a value but never names its inferred type, so this is the only
 * way to stay pinned to the contract instead of restating it. See `docs/CONTRACT_CHANGES.md`.
 */
export type ContractTransferEvent = Transfer['timeline'][number];

/** Appends an event, returning a new list. The input is never mutated. */
export function appendEvent(
  timeline: readonly TimelineEntry[],
  entry: TimelineEntry,
): TimelineEntry[] {
  return [...timeline, entry];
}

/**
 * The timeline an internal transfer is born with.
 *
 * Two events, both stamped at the same instant, and that is honest rather than lazy: an
 * internal transfer is authorised and delivered inside one database transaction, so there
 * is no interval between them to record. Collapsing them into a single `SETTLED` would
 * lose the fact that it was authorised at all, which is the event an investigator looks
 * for first.
 */
export function settledTimeline(at: Date): TimelineEntry[] {
  return [
    { status: TransferStatus.SUBMITTED, at, detail: TIMELINE_DETAIL.submitted },
    { status: TransferStatus.SETTLED, at, detail: TIMELINE_DETAIL.settled },
  ];
}

/** The status a timeline currently reports — its last event. */
export function currentStatus(timeline: readonly TimelineEntry[]): TransferStatus {
  return timeline.at(-1)?.status ?? TransferStatus.DRAFT;
}

/** Timeline entries in the wire shape. */
export function toContractTimeline(timeline: readonly TimelineEntry[]): ContractTransferEvent[] {
  return timeline.map((entry) => ({
    status: entry.status,
    at: toIso(entry.at),
    detail: entry.detail,
  }));
}
