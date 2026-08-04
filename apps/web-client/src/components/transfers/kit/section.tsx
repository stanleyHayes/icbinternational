'use client';

/**
 * A titled block of a screen.
 *
 * Almost every page in this lane is a stack of these: a heading, one sentence of orientation, an
 * optional action on the same line, then content. Doing it here means the heading level is
 * consistent — `<h2>` under the page's single `<h1>` — so heading navigation works down the whole
 * application rather than page by page.
 */

import type { ReactNode } from 'react';

import { Card, cn } from '@reliance/ui';

/** Props for {@link Section}. */
export interface SectionProps {
  /** The block's name. Rendered as the `<h2>`. */
  readonly title: string;
  /** One line of orientation under the title. */
  readonly description?: ReactNode;
  /** Trailing control, aligned to the title's first line. */
  readonly action?: ReactNode;
  /** Removes the card's padding so the block can hold a full-bleed table or list. */
  readonly flush?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * @example
 * <Section title="Standing orders" description="Payments that repeat on a schedule.">
 *   …
 * </Section>
 */
export function Section({
  title,
  description,
  action,
  flush = false,
  className,
  children,
}: SectionProps) {
  return (
    <Card flush={flush} className={cn('flex flex-col', className)}>
      <div className={cn('flex items-start justify-between gap-4', flush && 'p-5 pb-0')}>
        <div className="min-w-0">
          <h2 className="font-display text-fg text-lg font-semibold">{title}</h2>
          {description ? <p className="text-fg-muted mt-1 text-sm">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn(flush ? 'mt-3' : 'mt-4')}>{children}</div>
    </Card>
  );
}

/** Props for {@link SubSection}. */
export interface SubSectionProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

/** A named group inside a {@link Section} — a fieldset's worth of related controls. */
export function SubSection({ title, description, children, className }: SubSectionProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div>
        <h3 className="font-display text-fg text-base font-semibold">{title}</h3>
        {description ? <p className="text-fg-muted mt-0.5 text-sm">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
