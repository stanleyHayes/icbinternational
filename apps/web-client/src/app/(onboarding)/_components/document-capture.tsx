'use client';

/**
 * Capturing one photo or document.
 *
 * The preview URL is created in the change handler — an event, not an effect — and revoked when it
 * is replaced or the component unmounts. Leaking them keeps every rejected photo alive in memory
 * for the rest of the session, which on a phone is real.
 */

import { useEffect, useState } from 'react';

import type { CustomerDocument, DocumentKind } from '@reliance/contracts';
import { Alert } from '@reliance/ui';

import { describeError } from '@/lib/errors';
import { uploadKycDocument, UnacceptableFile } from '@/lib/kyc-upload';

import { CaptureZone } from './capture-zone';
import { DocumentPreview } from './document-preview';

const ACCEPTED = 'image/jpeg,image/png,application/pdf';

/** Props for {@link DocumentCapture}. */
export interface DocumentCaptureProps {
  readonly kind: DocumentKind;
  /** What to capture, in the imperative: "A photo of your passport". */
  readonly label: string;
  /** Steers the phone to the right camera. `user` is the selfie camera. */
  readonly camera?: 'user' | 'environment';
  /** Called once the bank has the document. */
  readonly onUploaded: (document: CustomerDocument) => void;
  /** The document already attached to the case, if the customer is coming back to this step. */
  readonly existing?: CustomerDocument;
  readonly onRemove?: () => void;
}

interface Upload {
  readonly previewUrl: string | null;
  readonly failure: string | null;
  readonly busy: boolean;
  readonly accept: (file: File) => void;
}

function useUpload(kind: DocumentKind, onUploaded: (document: CustomerDocument) => void): Upload {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const accept = (chosen: File): void => {
    setPreviewUrl(chosen.type.startsWith('image/') ? URL.createObjectURL(chosen) : null);
    setFailure(null);
    setBusy(true);

    void uploadKycDocument(chosen, kind)
      .then(onUploaded)
      .catch((error: unknown) => {
        setFailure(
          error instanceof UnacceptableFile ? error.message : describeError(error).message,
        );
        setPreviewUrl(null);
      })
      .finally(() => setBusy(false));
  };

  return { previewUrl, failure, busy, accept };
}

/** A file picker, an instant preview, and the upload. */
export function DocumentCapture(props: DocumentCaptureProps) {
  const { kind, label, camera, onUploaded, existing, onRemove } = props;
  const { previewUrl, failure, busy, accept } = useUpload(kind, onUploaded);

  return (
    <div className="flex flex-col gap-3">
      {failure ? (
        <Alert tone="danger" title="We could not use that file">
          {failure}
        </Alert>
      ) : null}

      <CaptureZone
        highlighted={Boolean(existing)}
        busy={busy}
        hasExisting={Boolean(existing)}
        label={label}
        accept={ACCEPTED}
        camera={camera}
        preview={<DocumentPreview previewUrl={previewUrl} existing={existing} label={label} />}
        onFile={accept}
        onRemove={onRemove}
      />
    </div>
  );
}
