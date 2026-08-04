/**
 * The shared layout behind EmptyState and ErrorState.
 *
 * The two differ in tone, wording and ARIA — not in structure — so the structure lives once.
 * Keeping them as separate public components rather than one with a `variant` prop is deliberate:
 * it is the only way the type system can insist that an error state has a retry action and an
 * empty state has a call to action.
 */

import { type ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface StatePanelProps {
  /** Decorative illustration or icon. */
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description?: ReactNode;
  /** Primary and secondary buttons. */
  readonly actions?: ReactNode;
  /** `alert` for failures, so the message is announced rather than merely displayed. */
  readonly role?: 'status' | 'alert';
  /** Tint applied to the icon well. */
  readonly iconClassName?: string;
  readonly className?: string;
}

/** Centred icon, heading, body and actions. Internal — use EmptyState or ErrorState. */
export function StatePanel(props: StatePanelProps) {
  const { icon, title, description, actions, role, iconClassName, className } = props;

  return (
    <div
      role={role}
      className={cn(
        'font-body text-fg flex flex-col items-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          className={cn(
            'rounded-pill bg-surface-sunken text-fg-muted flex size-12 items-center justify-center',
            iconClassName,
          )}
        >
          {icon}
        </span>
      )}
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description && <p className="text-fg-muted max-w-prose text-sm">{description}</p>}
      {actions && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">{actions}</div>
      )}
    </div>
  );
}
