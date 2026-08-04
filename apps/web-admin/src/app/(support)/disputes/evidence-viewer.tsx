/**
 * The files a dispute turns on.
 *
 * Evidence is the receipt, the delivery photograph, the cancellation email. It is read the
 * same way an identity document is, so it uses the same viewer — an analyst who has
 * learned to zoom and rotate in one place should not have to learn it again in another.
 *
 * Links are signed and short-lived, which is why each file is fetched as it is opened
 * rather than all at once when the case does.
 */

'use client';

import { useState } from 'react';

import { Button, EmptyState, Skeleton } from '@reliance/ui';

import { DocumentViewer, type ViewableDocument } from '@/components/compliance/kit';

import { useDisputeEvidence } from './use-disputes';

interface FileStripProps {
  readonly names: readonly { readonly id: string; readonly label: string }[];
  readonly openIndex: number;
  readonly onOpen: (index: number) => void;
}

function FileStrip({ names, openIndex, onOpen }: FileStripProps) {
  return (
    <ul className="flex flex-wrap gap-2">
      {names.map((file, index) => (
        <li key={file.id}>
          <Button
            size="sm"
            variant={index === openIndex ? 'primary' : 'secondary'}
            aria-pressed={index === openIndex}
            onClick={() => onOpen(index)}
          >
            {file.label}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export interface EvidenceViewerProps {
  readonly fileIds: readonly string[];
  /** Names the customer, so the viewer's alternative text says whose evidence it is. */
  readonly customerLabel: string;
}

/** The evidence attached to one dispute. */
export function EvidenceViewer({ fileIds, customerLabel }: EvidenceViewerProps) {
  const [openIndex, setOpenIndex] = useState(0);
  const files = useDisputeEvidence(fileIds);

  if (fileIds.length === 0) {
    return (
      <EmptyState
        title="No evidence attached"
        description="Neither the customer nor the merchant has sent anything. Ask the customer for a receipt or an order confirmation before deciding."
      />
    );
  }

  const active = files[openIndex];
  const document: ViewableDocument | null = active?.data
    ? {
        fileName: active.data.fileName,
        previewUrl: active.data.downloadUrl,
        uploadedAt: active.data.uploadedAt,
      }
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <FileStrip
        names={fileIds.map((fileId, index) => ({
          id: fileId,
          label: files[index]?.data?.fileName ?? `File ${index + 1}`,
        }))}
        openIndex={openIndex}
        onOpen={setOpenIndex}
      />

      {active?.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <DocumentViewer document={document} customerName={customerLabel} />
      )}
    </div>
  );
}
