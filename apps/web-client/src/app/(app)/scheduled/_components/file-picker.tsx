'use client';

/**
 * Choosing the payment file.
 *
 * A real `<input type="file">` behind a real `<label>`, not a styled div listening for drops. The
 * file picker is one of the few controls where the native element is strictly better: it works
 * from the keyboard, it works with a screen reader, and on a phone it opens the platform's own
 * file browser — including the "Files" app, where a spreadsheet exported on that phone actually
 * lives.
 */

import { Upload } from 'lucide-react';
import { useId } from 'react';

const ACCEPTED = '.csv,text/csv';

/** Props for {@link FilePicker}. */
export interface FilePickerProps {
  /** Called with the file the customer chose. */
  readonly onFile: (file: File) => void;
  /** The file already chosen, so the control can say what it is holding. */
  readonly fileName: string | null;
}

/**
 * @example <FilePicker onFile={read} fileName={name} />
 */
export function FilePicker({ onFile, fileName }: FilePickerProps) {
  const inputId = useId();

  return (
    <div className="border-border rounded-lg border border-dashed p-6 text-center">
      <Upload aria-hidden="true" className="text-fg-muted mx-auto size-6" />

      <label
        htmlFor={inputId}
        className="text-accent mt-3 inline-block cursor-pointer font-medium hover:underline"
      >
        Choose a payment file
      </label>

      <input
        id={inputId}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />

      <p className="text-fg-muted mt-1 text-sm">
        {fileName ?? 'Comma-separated, with the columns named in the first row.'}
      </p>
    </div>
  );
}
