'use client';

/**
 * The EmptyState — a list with nothing in it, said properly.
 *
 * "No transactions" is a dead end. An empty state should say what would put something here, which
 * is why the call to action is part of the component and not an afterthought at the call site.
 */

import { type ReactNode } from 'react';

import { StatePanel } from './state-panel.js';

export interface EmptyStateProps {
  readonly icon?: ReactNode;
  /** What is empty, in the user's words: "No payees yet". */
  readonly title: string;
  /** What to do about it. */
  readonly description?: ReactNode;
  /** The action that fills the space — "Add a payee". */
  readonly action?: ReactNode;
  readonly className?: string;
}

/**
 * @example
 * <EmptyState
 *   title="No payees yet"
 *   description="Add someone you pay regularly and they will appear here."
 *   action={<Button onClick={addPayee}>Add a payee</Button>}
 * />
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <StatePanel
      icon={icon}
      title={title}
      description={description}
      actions={action}
      // `status`, not `alert`: an empty list is the expected outcome of a successful request, and
      // interrupting a screen reader to say so is wrong.
      role="status"
      className={className}
    />
  );
}
