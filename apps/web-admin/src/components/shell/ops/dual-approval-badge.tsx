/**
 * Where a request stands under dual control.
 *
 * A manual posting needs two different people: one to raise it and a second to approve
 * it. The badge names both, because "Pending" alone leaves an operator guessing whether
 * they are waiting on somebody else or somebody else is waiting on them — and because
 * seeing the initiator's name is what stops an operator trying to approve their own work
 * and being refused.
 *
 * Colour is never the only signal: each state carries a word, and the expiry is spelled
 * out rather than implied by a fading tint.
 */

'use client';

import { ApprovalStatus } from '@reliance/contracts';
import { Badge, type Tone } from '@reliance/ui';

import { formatElapsed, humaniseCode } from '@/lib/format';

const TONE: Readonly<Record<ApprovalStatus, Tone>> = {
  [ApprovalStatus.PENDING]: 'pending',
  [ApprovalStatus.APPROVED]: 'success',
  [ApprovalStatus.REJECTED]: 'danger',
  [ApprovalStatus.EXPIRED]: 'neutral',
};

export interface DualApprovalBadgeProps {
  readonly status: ApprovalStatus;
  /** Name of the operator who raised the request. */
  readonly initiatedBy: string;
  /** Name of the operator who decided it, when one has. */
  readonly decidedBy?: string | null;
  /** ISO-8601 instant the request lapses, for a request still pending. */
  readonly expiresAt?: string | null;
  /** The bank's current instant, in epoch milliseconds. Needed for the expiry countdown. */
  readonly nowMs?: number;
}

function participants(props: DualApprovalBadgeProps): string {
  if (props.decidedBy) return `raised by ${props.initiatedBy}, decided by ${props.decidedBy}`;
  return `raised by ${props.initiatedBy}`;
}

/** The dual-control state of one approval request. */
export function DualApprovalBadge(props: DualApprovalBadgeProps) {
  const pending = props.status === ApprovalStatus.PENDING;
  const showExpiry = pending && props.expiresAt && props.nowMs !== undefined;

  return (
    <span className="font-body text-fg-muted flex flex-wrap items-center gap-2 text-sm">
      <Badge tone={TONE[props.status]}>{humaniseCode(props.status)}</Badge>
      <span>{participants(props)}</span>
      {showExpiry && (
        <span title={props.expiresAt ?? undefined}>
          lapses {formatElapsed(props.expiresAt, props.nowMs ?? 0)}
        </span>
      )}
    </span>
  );
}
