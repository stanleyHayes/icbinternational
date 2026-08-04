'use client';

import { CheckCircle2, TriangleAlert } from 'lucide-react';

import { cn } from '@reliance/ui';

import type { FormState } from '@/lib/actions/form-state';

const ICON_SIZE = 18;

/**
 * The one place a form says what happened.
 *
 * `aria-live="polite"` with `role="status"`: a customer who has just submitted a form is
 * usually still on the submit button, and without a live region the only feedback is a
 * visual change they cannot see. `polite` rather than `assertive` because the message
 * follows their own action — it is not an interruption.
 */
export function FormStatus({
  state,
  className,
}: {
  readonly state: FormState;
  readonly className?: string;
}) {
  const failedSubmission = state.status === 'error';

  return (
    <div role="status" aria-live="polite" className={cn('min-h-0', className)}>
      {state.status === 'idle' ? null : (
        <p
          className={cn(
            'flex items-start gap-2 rounded-md border p-3 text-sm',
            failedSubmission
              ? 'border-danger/40 bg-danger-soft text-fg'
              : 'border-accent/40 bg-accent-soft text-fg',
          )}
        >
          {failedSubmission ? (
            <TriangleAlert size={ICON_SIZE} aria-hidden className="text-danger mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 size={ICON_SIZE} aria-hidden className="text-accent mt-0.5 shrink-0" />
          )}
          <span>{state.message}</span>
        </p>
      )}
    </div>
  );
}
