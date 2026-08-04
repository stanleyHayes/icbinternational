/**
 * The identity-review workstation proper: one case, side by side.
 *
 * The document is on the left at the size an analyst can actually read it, and the
 * checklist and the decision are on the right. That arrangement is the whole point of the
 * screen — a workflow that makes an analyst scroll away from the passport to tick a box
 * about the passport produces ticks that mean nothing.
 *
 * The panel is a full-height region rather than a drawer because a drawer wide enough to
 * read a document in is a page with extra steps.
 */

'use client';

import { useState } from 'react';

import { Permission, type CustomerDocument, type KycCase } from '@reliance/contracts';
import { Badge, Button, EmptyState, StatusPill } from '@reliance/ui';

import {
  DocumentViewer,
  kycTone,
  QueueError,
  QueueLoading,
  ScreenPanel,
} from '@/components/compliance/kit';
import { humaniseCode } from '@/lib/format';
import { usePermissions } from '@/lib/permissions';

import { useKycCase } from '../data/use-kyc';

import { JUDGEMENT_COUNT, KycChecklist } from './kyc-checklist';
import { KycDecision } from './kyc-decision';

const CANNOT_DECIDE =
  'You can read this case but not decide it. Your role does not include identity decisions.';

interface DocumentListProps {
  readonly documents: readonly CustomerDocument[];
  readonly selectedId: string | null;
  readonly onSelect: (documentId: string) => void;
}

function DocumentList({ documents, selectedId, onSelect }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <p className="font-body text-fg-muted text-sm">
        Nothing has been uploaded against this case yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {documents.map((document) => (
        <li key={document.id}>
          <Button
            size="sm"
            variant={document.id === selectedId ? 'primary' : 'secondary'}
            aria-pressed={document.id === selectedId}
            onClick={() => onSelect(document.id)}
          >
            {humaniseCode(document.kind)}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function CaseSummary({ record }: Readonly<{ record: KycCase }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill tone={kycTone(record.status)} label={humaniseCode(record.status)} />
      <Badge>
        Tier {record.currentTier} held, tier {record.requestedTier} requested
      </Badge>
      {record.reviewerMessage && (
        <span className="font-body text-fg-muted text-xs">
          Last message to the customer: {record.reviewerMessage}
        </span>
      )}
    </div>
  );
}

export interface KycReviewProps {
  readonly caseId: string | null;
  readonly customerName: string;
  readonly onDecided: () => void;
}

function NothingSelected() {
  return (
    <EmptyState
      title="Choose a case to review"
      description="Select a row in the queue to open the customer's documents alongside the checklist."
    />
  );
}

/** One identity case, with its documents, checklist and decision. */
export function KycReview({ caseId, customerName, onDecided }: KycReviewProps) {
  const permissions = usePermissions();
  const review = useKycCase(caseId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outstanding, setOutstanding] = useState(JUDGEMENT_COUNT);

  if (caseId === null) return <NothingSelected />;
  if (review.isPending) return <QueueLoading label="the identity case" />;
  if (review.isError) {
    return (
      <QueueError error={review.error} subject="this identity case" onRetry={review.refetch} />
    );
  }

  const record = review.data;
  const selected =
    record.documents.find((document) => document.id === selectedId) ?? record.documents[0] ?? null;

  return (
    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[3fr_2fr]">
      <ScreenPanel
        title="Evidence"
        actions={
          <DocumentList
            documents={record.documents}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        }
      >
        <DocumentViewer document={selected} customerName={customerName} />
      </ScreenPanel>

      <DecisionColumn
        record={record}
        customerName={customerName}
        outstanding={outstanding}
        canDecide={permissions.has(Permission.KYC_DECIDE)}
        onOutstandingChange={setOutstanding}
        onDecided={onDecided}
      />
    </div>
  );
}

interface DecisionColumnProps {
  readonly record: KycCase;
  readonly customerName: string;
  readonly outstanding: number;
  readonly canDecide: boolean;
  readonly onOutstandingChange: (outstanding: number) => void;
  readonly onDecided: () => void;
}

function DecisionColumn(props: DecisionColumnProps) {
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-auto">
      <ScreenPanel title={`Case for ${props.customerName}`}>
        <div className="flex flex-col gap-4">
          <CaseSummary record={props.record} />
          <KycChecklist record={props.record} onOutstandingChange={props.onOutstandingChange} />
        </div>
      </ScreenPanel>

      <ScreenPanel title="Your decision">
        <KycDecision
          record={props.record}
          outstandingChecks={props.outstanding}
          blockedReason={props.canDecide ? null : CANNOT_DECIDE}
          onDecided={props.onDecided}
        />
      </ScreenPanel>
    </div>
  );
}
