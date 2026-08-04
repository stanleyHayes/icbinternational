/**
 * Who may decide a request under dual control.
 *
 * The platform refuses self-approval and that refusal is the real control. This exists so
 * the operator learns before they commit rather than after: the initiator sees the panel
 * disabled with their own name on it, which is also the clearest possible statement of
 * why a queue item they raised is still sitting there.
 *
 * The rule itself is small and worth stating plainly. A request may be decided by an
 * operator who holds the approval permission, is not the one who raised it, and is
 * looking at a request that is still open.
 */

import { ApprovalStatus, type ApprovalRequest } from '@reliance/contracts';

/** Why this operator cannot decide this request, or `null` when they can. */
export function blockedReasonFor(options: {
  readonly request: ApprovalRequest;
  readonly operatorId: string | null;
  readonly canApprove: boolean;
  /** The bank's current instant, in epoch milliseconds. */
  readonly nowMs: number;
}): string | null {
  const { request, operatorId, canApprove, nowMs } = options;

  if (request.status !== ApprovalStatus.PENDING) {
    return 'This request has already been decided, so it can no longer be changed.';
  }

  if (new Date(request.expiresAt).getTime() <= nowMs) {
    return 'This request has lapsed. Ask the initiator to raise it again.';
  }

  if (operatorId !== null && request.initiatedBy.id === operatorId) {
    return 'You raised this request, so you cannot approve it. A colleague must decide it.';
  }

  if (!canApprove) {
    return 'Your role does not allow approvals. Ask a supervisor to decide this request.';
  }

  return null;
}

/** True when this operator is the one who raised the request. */
export function isInitiator(request: ApprovalRequest, operatorId: string | null): boolean {
  return operatorId !== null && request.initiatedBy.id === operatorId;
}
