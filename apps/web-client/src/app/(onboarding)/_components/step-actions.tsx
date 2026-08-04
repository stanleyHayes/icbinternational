'use client';

/**
 * The controls at the foot of every wizard step.
 *
 * Forward on the right, back on the left, in that order in the DOM as well as on screen — a
 * keyboard user should reach the action they are most likely to want first.
 *
 * There is no "save and finish later" button, because there is nothing to press it for: every
 * accepted step is already saved server-side and the half-typed one is kept by the browser. The
 * note under the buttons says so, which is what people actually want to know.
 */

import { Button } from '@reliance/ui';

/** Props for {@link StepActions}. */
export interface StepActionsProps {
  /** Label for the forward action. Say what happens: "Continue", "Submit for review". */
  readonly submitLabel: string;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  /** Omitted on the first step, where there is nothing to go back to. */
  readonly onBack?: () => void;
  /** Rendered instead of the default reassurance line. */
  readonly note?: string;
}

const DEFAULT_NOTE =
  'Everything you have entered is saved. You can close this and come back to it.';

/** Back and continue, with the saved-progress reassurance. */
export function StepActions({ submitLabel, busy, disabled, onBack, note }: StepActionsProps) {
  return (
    <div className="mt-8 flex flex-col gap-3">
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
            Back
          </Button>
        ) : null}
        <Button type="submit" loading={busy} disabled={disabled}>
          {submitLabel}
        </Button>
      </div>
      <p className="text-fg-subtle text-sm sm:text-right">{note ?? DEFAULT_NOTE}</p>
    </div>
  );
}
