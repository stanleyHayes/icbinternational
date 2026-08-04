'use client';

/**
 * The bank's empty states.
 *
 * The design system's `EmptyState` handles the layout; this adds the part that is easy to get
 * wrong. An empty state is not "no data" — it is a moment where the customer has arrived
 * somewhere and found nothing, and the only useful response is to say why and offer the next step.
 * "No transactions" is a shrug. "Nothing has gone in or out of this account since it opened on
 * 4 March" is an answer.
 *
 * A screen that filters to nothing gets a *different* message from a screen that has nothing yet,
 * because the remedy is different: clear the filter, versus do the thing for the first time.
 */

import { Inbox, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

import { EmptyState, cn } from '@reliance/ui';

/** Props for {@link EmptyPanel}. */
export interface EmptyPanelProps {
  /** What is not here, in the customer's words. Sentence case, no full stop. */
  readonly title: string;
  /** Why it is not here, and what to do about it. */
  readonly description: ReactNode;
  /** The single next step. One button; two is a decision the customer did not ask for. */
  readonly action?: ReactNode;
  /** Swap the icon when the page has a stronger one of its own. */
  readonly icon?: ReactNode;
  /** Sit inside a bordered card. Off when the panel already has a border of its own. */
  readonly bordered?: boolean;
  readonly className?: string;
}

/**
 * @example
 * <EmptyPanel
 *   title="No standing orders yet"
 *   description="Standing orders you set up will appear here, with the next payment date."
 *   action={<Button>Set up a standing order</Button>}
 * />
 */
export function EmptyPanel({
  title,
  description,
  action,
  icon,
  bordered = true,
  className,
}: EmptyPanelProps) {
  return (
    <div
      className={cn(
        'rounded-lg px-6 py-10',
        bordered && 'border-border bg-surface border border-dashed',
        className,
      )}
    >
      <EmptyState
        icon={icon ?? <Inbox aria-hidden="true" className="size-6" />}
        title={title}
        description={description}
        action={action}
      />
    </div>
  );
}

/** Props for {@link NoResultsPanel}. */
export interface NoResultsPanelProps {
  /** What was searched or filtered for, quoted back so the customer can see the typo. */
  readonly query?: string;
  /** The control that puts the list back — "Clear filters", usually. */
  readonly action?: ReactNode;
  readonly className?: string;
}

/**
 * The empty state for a list that has been filtered or searched to nothing.
 *
 * Distinct from {@link EmptyPanel} on purpose: telling somebody who searched for a payee that they
 * have no payees, when they have forty, reads as the bank having lost them.
 */
export function NoResultsPanel({ query, action, className }: NoResultsPanelProps) {
  return (
    <EmptyPanel
      className={className}
      icon={<SearchX aria-hidden="true" className="size-6" />}
      title="Nothing matched"
      description={
        query
          ? `We could not find anything for “${query}”. Check the spelling, or widen the dates and filters.`
          : 'Nothing matches the filters you have set. Widen them, or clear them to see everything again.'
      }
      action={action}
    />
  );
}
