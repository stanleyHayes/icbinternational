'use client';

/**
 * What the customer can see of the file they just chose.
 *
 * The image is drawn from a `blob:` URL made on the device, not from anything the bank sends back.
 * It appears before a byte has left the phone, which is what lets somebody notice the glare across
 * their passport and retake it; and the stored copy is served only over a short-lived signed URL,
 * which is not something to re-fetch into an `<img>` on every render.
 */

import { Camera, FileCheck2 } from 'lucide-react';

import type { CustomerDocument } from '@reliance/contracts';

/** Props for {@link DocumentPreview}. */
export interface DocumentPreviewProps {
  /** A `blob:` URL for an image just chosen on this device. */
  readonly previewUrl: string | null;
  /** The document the bank already holds, if there is one. */
  readonly existing: CustomerDocument | undefined;
  /** What was asked for, used in the image's alternative text. */
  readonly label: string;
}

/** The thumbnail, the file name, or the empty prompt. */
export function DocumentPreview({ previewUrl, existing, label }: DocumentPreviewProps) {
  if (previewUrl) {
    return (
      // own device. `next/image` optimises assets it can fetch and cannot process this one.
      <img
        src={previewUrl}
        alt={`Preview of the ${label.toLowerCase()} you selected`}
        className="max-h-56 rounded-md object-contain"
      />
    );
  }

  if (existing) {
    return (
      <>
        <FileCheck2 aria-hidden="true" className="text-accent size-8" />
        <p className="text-fg text-sm">
          <span className="font-medium">{existing.fileName}</span> is with us.
        </p>
      </>
    );
  }

  return (
    <>
      <Camera aria-hidden="true" className="text-fg-subtle size-8" />
      <p className="text-fg-muted text-sm">{label}</p>
    </>
  );
}
