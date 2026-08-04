/**
 * Reading somebody's passport properly.
 *
 * An analyst decides whether a document is genuine by looking at the small parts of it —
 * the expiry date, the machine-readable strip, whether the photograph has been replaced.
 * A thumbnail cannot answer any of those, so the viewer zooms to 400% and lets the image
 * be dragged under the frame, which is faster than scrollbars when both hands are already
 * on the keyboard for the checklist.
 *
 * Rotation is here because scanned proof of address arrives sideways more often than not,
 * and an analyst who has to tilt their head is an analyst who stops looking carefully.
 */

'use client';

import { Maximize2, Minus, Plus, RotateCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button, EmptyState } from '@reliance/ui';

import { formatInstant } from '@/lib/format';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
const FIT_ZOOM = 1;
const QUARTER_TURN = 90;
const FULL_TURN = 360;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** Percentage label for the current magnification. */
function zoomLabel(zoom: number): string {
  const PERCENT = 100;
  return `${Math.round(zoom * PERCENT)}%`;
}

/**
 * The least a thing needs to be for this viewer to show it.
 *
 * Deliberately narrower than either `CustomerDocument` or `FileReference`: an identity
 * document and a piece of dispute evidence are read the same way, and one viewer that
 * takes the fields both have is better than two that drift.
 */
export interface ViewableDocument {
  readonly fileName: string;
  /** Short-lived signed URL, or `null` when the link has lapsed. */
  readonly previewUrl: string | null;
  readonly uploadedAt: string;
}

export interface DocumentViewerProps {
  readonly document: ViewableDocument | null;
  /** Names the customer, so the image's alternative text says whose document it is. */
  readonly customerName: string;
}

interface ViewerControlsProps {
  readonly zoom: number;
  readonly onZoom: (zoom: number) => void;
  readonly onRotate: () => void;
}

interface ToolButtonProps {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

function ToolButton({ label, disabled, onClick, children }: ToolButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ViewerControls({ zoom, onZoom, onRotate }: ViewerControlsProps) {
  return (
    <div className="border-border flex items-center gap-1 border-b px-2 py-1.5">
      <ToolButton
        label="Zoom out"
        disabled={zoom <= MIN_ZOOM}
        onClick={() => onZoom(clampZoom(zoom - ZOOM_STEP))}
      >
        <Minus className="size-4" />
      </ToolButton>
      <span className="text-fg-muted min-w-14 text-center font-mono text-xs tabular-nums">
        {zoomLabel(zoom)}
      </span>
      <ToolButton
        label="Zoom in"
        disabled={zoom >= MAX_ZOOM}
        onClick={() => onZoom(clampZoom(zoom + ZOOM_STEP))}
      >
        <Plus className="size-4" />
      </ToolButton>
      <ToolButton label="Fit the document to the frame" onClick={() => onZoom(FIT_ZOOM)}>
        <Maximize2 className="size-4" />
      </ToolButton>
      <ToolButton label="Rotate a quarter turn clockwise" onClick={onRotate}>
        <RotateCw className="size-4" />
      </ToolButton>
    </div>
  );
}

function NoPreview({ fileName }: Readonly<{ fileName: string }>) {
  return (
    <EmptyState
      title="This document cannot be shown here"
      description={`${fileName} is held in secure storage and its preview link has lapsed. Reopen the case to request a new one.`}
    />
  );
}

/** A zoomable, rotatable view of one identity document. */
export function DocumentViewer({ document, customerName }: DocumentViewerProps) {
  const [zoom, setZoom] = useState(FIT_ZOOM);
  const [rotation, setRotation] = useState(0);

  if (!document) {
    return (
      <EmptyState
        title="No document selected"
        description="Choose a document from the list to examine it."
      />
    );
  }

  return (
    <div className="border-border bg-surface-sunken flex h-full min-h-0 flex-col rounded-md border">
      <ViewerControls
        zoom={zoom}
        onZoom={setZoom}
        onRotate={() => setRotation((turn) => (turn + QUARTER_TURN) % FULL_TURN)}
      />

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {document.previewUrl ? (
          // The preview is a short-lived signed URL on a host the image optimiser must
          // never cache, and a customer's passport must never reach an optimiser at all.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={document.previewUrl}
            alt={`${document.fileName}, submitted by ${customerName}`}
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
            className="mx-auto max-w-full origin-top transition-transform motion-reduce:transition-none"
          />
        ) : (
          <NoPreview fileName={document.fileName} />
        )}
      </div>

      <p className="border-border font-body text-fg-muted border-t px-3 py-2 text-xs">
        {document.fileName} · uploaded {formatInstant(document.uploadedAt)}
      </p>
    </div>
  );
}
