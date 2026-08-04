'use client';

/**
 * The card every authentication screen sits in.
 *
 * One heading level, one place for the supporting line, one place for the "or do this instead"
 * footer. Consistency matters more here than anywhere else in the app: this is where somebody who
 * has been phished compares what they are looking at with what they remember.
 */

import type { ReactNode } from 'react';

import { cn, TEXT_STYLE } from '@reliance/ui';

/** Props for {@link AuthCard}. */
export interface AuthCardProps {
  /** The task, in the imperative: "Sign in", "Choose a new password". */
  readonly title: string;
  /** One line of orientation. Say what happens next, not what the screen is. */
  readonly description?: ReactNode;
  readonly children: ReactNode;
  /** The alternative route out — "Not registered yet?", "Back to sign in". */
  readonly footer?: ReactNode;
}

/**
 * @example
 * <AuthCard title="Sign in" description="Use the email address you registered with.">…</AuthCard>
 */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <section className="border-border bg-surface rounded-xl border p-6 shadow-sm sm:p-8">
      <h1 className={cn(TEXT_STYLE['heading-md'], 'text-balance')}>{title}</h1>
      {description ? (
        <p className={cn(TEXT_STYLE.caption, 'mt-2 text-pretty')}>{description}</p>
      ) : null}

      <div className="mt-6">{children}</div>

      {footer ? (
        <div className="border-border text-fg-muted mt-6 border-t pt-5 text-sm">{footer}</div>
      ) : null}
    </section>
  );
}
