'use client';

/**
 * The dashed box a document is chosen in.
 *
 * The file input is visually hidden but present in the DOM and labelled, so a keyboard or
 * screen-reader user reaches a real `<input type="file">` rather than a button that opens one by
 * script. Styling a native file input away and driving it from a button is the standard trick;
 * removing the input entirely is the standard mistake.
 */

import { Trash2, Upload } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

import { Button, cn } from '@reliance/ui';

/** Props for {@link CaptureZone}. */
export interface CaptureZoneProps {
  /** Draws the accepted state — solid border, tinted fill. */
  readonly highlighted: boolean;
  readonly busy: boolean;
  readonly hasExisting: boolean;
  /** What is being asked for. Becomes the input's accessible name. */
  readonly label: string;
  /** `accept` attribute for the file input. */
  readonly accept: string;
  /** Steers the phone to the right camera. */
  readonly camera?: 'user' | 'environment';
  readonly preview: ReactNode;
  readonly onFile: (file: File) => void;
  readonly onRemove?: () => void;
}

interface ControlsProps {
  readonly busy: boolean;
  readonly hasExisting: boolean;
  readonly onChoose: () => void;
  readonly onRemove?: () => void;
}

function Controls({ busy, hasExisting, onChoose, onRemove }: ControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        type="button"
        variant={hasExisting ? 'secondary' : 'primary'}
        loading={busy}
        onClick={onChoose}
        startIcon={<Upload aria-hidden="true" className="size-4" />}
      >
        {hasExisting ? 'Replace it' : 'Choose a file or take a photo'}
      </Button>
      {hasExisting && onRemove ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onRemove}
          startIcon={<Trash2 aria-hidden="true" className="size-4" />}
        >
          Remove
        </Button>
      ) : null}
    </div>
  );
}

/** The preview, the hidden input and the two controls. */
export function CaptureZone(props: CaptureZoneProps) {
  const { highlighted, busy, hasExisting, label, accept, camera, preview, onFile, onRemove } =
    props;
  const input = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        'border-border bg-canvas flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-6 text-center',
        highlighted && 'border-accent bg-accent-soft/30 border-solid',
      )}
    >
      {preview}

      <input
        ref={input}
        type="file"
        accept={accept}
        capture={camera}
        className="sr-only"
        aria-label={label}
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) onFile(chosen);
        }}
      />

      <Controls
        busy={busy}
        hasExisting={hasExisting}
        onChoose={() => input.current?.click()}
        onRemove={onRemove}
      />
    </div>
  );
}
