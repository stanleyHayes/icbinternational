'use client';

/**
 * The ErrorState — a section that failed to load.
 *
 * Retry is a required prop, not an optional one. A banking screen that fails and offers no way
 * forward leaves the user reloading the whole app to find out whether their money moved.
 *
 * The reference is rendered in mono and is selectable: it is the string support will ask for,
 * and a correlation id the user cannot copy is a correlation id nobody ever reports.
 */

import { type ReactNode } from 'react';

import { AlertTriangleIcon } from '../foundation/icons.js';

import { StatePanel } from './state-panel.js';

export interface ErrorStateProps {
  /** Plain-language failure. Never the raw exception. */
  readonly title?: string;
  readonly description?: string;
  /** Correlation id from the API error envelope. */
  readonly reference?: string;
  /** The retry control. Required — see above. */
  readonly action: ReactNode;
  readonly className?: string;
}

const DEFAULT_TITLE = 'Something went wrong';
const DEFAULT_DESCRIPTION = 'We could not load this. Your money and your data are unaffected.';

/**
 * @example
 * <ErrorState reference={error.correlationId} action={<Button onClick={refetch}>Try again</Button>} />
 */
export function ErrorState(props: ErrorStateProps) {
  const {
    title = DEFAULT_TITLE,
    description = DEFAULT_DESCRIPTION,
    reference,
    action,
    className,
  } = props;

  return (
    <StatePanel
      icon={<AlertTriangleIcon className="size-6" />}
      iconClassName="bg-danger-soft text-danger"
      title={title}
      description={
        <>
          {description}
          {reference && (
            <span className="text-fg-subtle mt-2 block font-mono text-xs select-all">
              Reference {reference}
            </span>
          )}
        </>
      }
      actions={action}
      role="alert"
      className={className}
    />
  );
}
