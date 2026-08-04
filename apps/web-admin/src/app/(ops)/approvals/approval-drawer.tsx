/**
 * Deciding one request.
 *
 * The panel refuses locally exactly what the platform would refuse — a decision on a
 * request the operator raised themselves, one that has already been decided, one that has
 * lapsed, or one their role does not cover — and it says which of those applies. An
 * operator who is told "you raised this" understands the queue; one who is told "403"
 * learns to distrust it.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ApprovalRequest } from '@reliance/contracts';
import { Permission } from '@reliance/contracts';

import { blockedReasonFor, opsKeys, useNowMs } from '@/components/ops';
import {
  DecisionPanel,
  DetailDrawer,
  DetailField,
  DetailSection,
  DualApprovalBadge,
  type DecisionOutcome,
} from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { formatInstant, humaniseCode } from '@/lib/format';
import { usePermissions } from '@/lib/permissions';
import { useAdminSession } from '@/lib/session';

import { PayloadFields } from './payload-fields';

export interface ApprovalDrawerProps {
  readonly request: ApprovalRequest | null;
  readonly onClose: () => void;
}

function RequestFields({ request }: Readonly<{ request: ApprovalRequest }>) {
  return (
    <DetailSection title="The request">
      <DetailField label="Kind">{humaniseCode(request.kind)}</DetailField>
      <DetailField label="Justification">{request.justification}</DetailField>
      <DetailField label="Raised">{formatInstant(request.createdAt)}</DetailField>
      <DetailField label="Lapses">{formatInstant(request.expiresAt)}</DetailField>
      <DetailField label="Decided">{formatInstant(request.decidedAt)}</DetailField>
      <DetailField label="Decision note">{request.decisionNote ?? '—'}</DetailField>
    </DetailSection>
  );
}

/** One dual-control request, with the decision panel underneath it. */
/** Who raised it, who decided it, and how long is left to decide. */
function RequestBadge({
  request,
  nowMs,
}: {
  readonly request: NonNullable<ApprovalDrawerProps['request']>;
  readonly nowMs: number;
}) {
  return (
    <DualApprovalBadge
      status={request.status}
      initiatedBy={request.initiatedBy.name}
      decidedBy={request.decidedBy?.name ?? null}
      expiresAt={request.expiresAt}
      nowMs={nowMs}
    />
  );
}

/** Approve or reject, with the reason it cannot be either when dual control forbids it. */
function RequestDecision({
  request,
  blocked,
  decide,
}: {
  readonly request: NonNullable<ApprovalDrawerProps['request']>;
  readonly blocked: string | null;
  readonly decide: {
    readonly isPending: boolean;
    readonly error: unknown;
    readonly mutate: (input: { id: string; outcome: DecisionOutcome; note: string }) => void;
  };
}) {
  return (
    <DecisionPanel
      title="Your decision"
      approveLabel="Approve and post"
      rejectLabel="Reject"
      blockedReason={blocked}
      isDeciding={decide.isPending}
      error={decide.error ? messageFor(decide.error) : null}
      onDecide={(outcome, note) => decide.mutate({ id: request.id, outcome, note })}
    />
  );
}

export function ApprovalDrawer({ request, onClose }: ApprovalDrawerProps) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const nowMs = useNowMs();
  const { operator } = useAdminSession();
  const canApprove = usePermissions().has(Permission.POSTING_APPROVE);

  const decide = useMutation({
    mutationFn: async (input: {
      readonly id: string;
      readonly outcome: DecisionOutcome;
      readonly note: string;
    }) => client.admin.decideApproval(input.id, { decision: input.outcome, note: input.note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsKeys.all('approvals') });
      onClose();
    },
  });

  const blocked = request
    ? blockedReasonFor({ request, operatorId: operator?.id ?? null, canApprove, nowMs })
    : null;

  return (
    <DetailDrawer
      open={request !== null}
      onClose={onClose}
      title="Approval request"
      subtitle={request && <RequestBadge request={request} nowMs={nowMs} />}
      recordId={request?.id}
      footer={request && <RequestDecision request={request} blocked={blocked} decide={decide} />}
    >
      {request && <RequestFields request={request} />}
      {request && <PayloadFields payload={request.payload} amount={request.amount} />}
    </DetailDrawer>
  );
}
