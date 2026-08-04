'use client';

/**
 * The heading block every screen in the application starts with.
 *
 * It exists so the `<h1>` is in the same place, at the same size, on every route — a screen-reader
 * user navigating by heading should not have to work out afresh on each page where the page's own
 * name is. Actions sit on the same line on a wide viewport and wrap beneath on a narrow one, which
 * is also the order they are read in.
 */

import type { ReactNode } from 'react';

import { cn, TEXT_STYLE } from '@reliance/ui';

/** Props for {@link PageHeader}. */
export interface PageHeaderProps {
  /** The page's name. Becomes the `<h1>`; there is exactly one per screen. */
  readonly title: string;
  /** One line of orientation under the title. Optional, and usually worth having. */
  readonly description?: ReactNode;
  /** Breadcrumb or back link, rendered above the title. */
  readonly eyebrow?: ReactNode;
  /** Primary and secondary actions for the page. */
  readonly actions?: ReactNode;
  /** Tabs, filters or a summary strip, rendered below the block and inside its bottom border. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * @example
 * <PageHeader title="Accounts" description="Everything you hold with us" actions={<Button>Open an account</Button>} />
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('border-border border-b pb-5', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <div className="text-fg-muted mb-1 text-sm">{eyebrow}</div> : null}
          <h1 className={cn(TEXT_STYLE['heading-lg'], 'text-balance')}>{title}</h1>
          {description ? (
            <p className={cn(TEXT_STYLE.caption, 'mt-1 max-w-2xl text-pretty')}>{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  );
}
