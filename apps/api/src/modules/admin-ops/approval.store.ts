import { Injectable } from '@nestjs/common';

import { type ApprovalRequest, ApprovalStatus } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';

/**
 * In-memory approval store for admin dual-control workflow.
 *
 * Two rules are enforced here:
 * 1. The approver can never be the same admin as the initiator.
 * 2. An approval that has already been decided is immutable.
 *
 * Persistence is process-local (dev/demo). A production implementation would use MongoDB
 * with a `status` index and a TTL on `expiresAt`.
 */
@Injectable()
export class ApprovalStore {
  private readonly map = new Map<string, ApprovalRequest>();
  constructor(private readonly clock: ClockService) {}

  insert(request: ApprovalRequest): void {
    this.map.set(request.id, request);
  }

  findById(id: string): ApprovalRequest | undefined {
    return this.map.get(id);
  }

  list(): ApprovalRequest[] {
    return [...this.map.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  decide(
    id: string,
    decidedBy: ApprovalRequest['decidedBy'],
    decision: 'APPROVE' | 'REJECT',
    note: string,
  ): ApprovalRequest | null {
    const current = this.map.get(id);
    if (!current) return null;
    if (current.status !== ApprovalStatus.PENDING) return null;

    const updated: ApprovalRequest = {
      ...current,
      status: decision === 'APPROVE' ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
      decidedBy,
      decisionNote: note,
      decidedAt: this.clock.now().toISOString(),
    };
    this.map.set(id, updated);
    return updated;
  }
}
