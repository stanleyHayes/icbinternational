'use client';

/**
 * The chrome around one wizard step: progress, heading, and the way back.
 *
 * Progress is shown because "how much more of this is there" is the question that decides whether
 * somebody finishes. The design system's `Stepper` carries the state in text as well as in colour,
 * so the answer is available to a screen reader too.
 */

import type { ReactNode } from 'react';

import { cn, Stepper, TEXT_STYLE, type Step } from '@reliance/ui';

import { stepIndex, WIZARD_STEPS, type WizardStep } from '@/lib/kyc-steps';

const STEPS: readonly Step[] = WIZARD_STEPS.map((entry) => ({
  id: entry.slug,
  label: entry.shortLabel,
}));

/** Props for {@link WizardFrame}. */
export interface WizardFrameProps {
  readonly current: WizardStep;
  readonly children: ReactNode;
}

/** Progress indicator, heading and the step's own content. */
export function WizardFrame({ current, children }: WizardFrameProps) {
  const index = stepIndex(current.step);

  return (
    <div className="flex flex-col gap-8">
      <Stepper
        steps={STEPS}
        currentIndex={index}
        label="Opening your account"
        className="hidden sm:block"
      />

      <p className="text-fg-muted text-sm font-medium sm:hidden" aria-hidden="true">
        Step {index + 1} of {STEPS.length}
      </p>

      <div>
        <h1 className={cn(TEXT_STYLE['heading-lg'], 'text-balance')}>{current.title}</h1>
        <p className={cn(TEXT_STYLE.caption, 'mt-2 max-w-prose text-pretty')}>
          {current.description}
        </p>
      </div>

      <div className="border-border bg-surface rounded-xl border p-6 sm:p-8">{children}</div>
    </div>
  );
}
