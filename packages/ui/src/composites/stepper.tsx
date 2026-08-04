/**
 * The Stepper — progress through a multi-step flow.
 *
 * Onboarding, KYC and a new-payee setup all take several screens, and the single most useful
 * thing the interface can say is "3 of 5". Rendered as an ordered list because that is what it
 * is; the state of each step is in text (`sr-only`), never only in a tick or a colour.
 */

import { CheckIcon } from '../foundation/icons.js';
import { cn } from '../lib/cn.js';

/** Where a step sits relative to the user. */
export type StepStatus = 'complete' | 'current' | 'upcoming';

export interface Step {
  readonly id: string;
  readonly label: string;
  /** One line of detail, e.g. "Photo ID and a selfie". */
  readonly description?: string;
}

const MARKER: Readonly<Record<StepStatus, string>> = {
  complete: 'border-accent bg-accent text-accent-fg',
  current: 'border-accent bg-surface text-accent',
  upcoming: 'border-border bg-surface text-fg-subtle',
};

const LABEL: Readonly<Record<StepStatus, string>> = {
  complete: 'text-fg',
  current: 'text-fg font-medium',
  upcoming: 'text-fg-muted',
};

/** Announced to screen readers so the state is never carried by the tick alone. */
const STATUS_TEXT: Readonly<Record<StepStatus, string>> = {
  complete: 'Completed',
  current: 'Current step',
  upcoming: 'Not started',
};

function statusOf(index: number, currentIndex: number): StepStatus {
  if (index < currentIndex) return 'complete';
  return index === currentIndex ? 'current' : 'upcoming';
}

function StepItem({
  step,
  index,
  status,
}: Readonly<{ step: Step; index: number; status: StepStatus }>) {
  return (
    <li className="flex min-w-0 flex-1 items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'rounded-pill flex size-7 shrink-0 items-center justify-center border',
          'font-display text-xs font-semibold',
          MARKER[status],
        )}
      >
        {status === 'complete' ? <CheckIcon className="size-4" /> : index + 1}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={LABEL[status]}>
          {step.label}
          <span className="sr-only"> — {STATUS_TEXT[status]}</span>
        </span>
        {step.description && <span className="text-fg-muted text-xs">{step.description}</span>}
      </span>
    </li>
  );
}

export interface StepperProps {
  readonly steps: readonly Step[];
  /** Zero-based index of the step in progress. */
  readonly currentIndex: number;
  readonly orientation?: 'horizontal' | 'vertical';
  /** Names the flow — "Identity verification". */
  readonly label: string;
  readonly className?: string;
}

/**
 * @example <Stepper label="Identity verification" steps={steps} currentIndex={2} />
 */
export function Stepper({
  steps,
  currentIndex,
  orientation = 'horizontal',
  label,
  className,
}: Readonly<StepperProps>) {
  return (
    <nav aria-label={label}>
      <ol
        className={cn(
          'font-body flex gap-4 text-sm',
          orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap items-start',
          className,
        )}
      >
        {steps.map((step, index) => (
          <StepItem
            key={step.id}
            step={step}
            index={index}
            status={statusOf(index, currentIndex)}
          />
        ))}
      </ol>
    </nav>
  );
}
