'use client';

/**
 * A home-screen panel, and the reason the page does not jump.
 *
 * Every panel reserves its height before its data arrives. That is the whole trick: the home
 * screen makes eight requests, they land in whatever order the network decides, and without
 * reserved space each arrival pushes everything below it down. On a phone that means the customer
 * taps "Freeze card" a fraction of a second after aiming at "Send money".
 *
 * The panel also owns the three states so no individual panel has to remember them: a skeleton
 * inside the reserved box, a sentence in the bank's voice if the request fails, and the content.
 * A failure in one panel never takes the page down — the balance is still readable when the
 * subscription tracker is not.
 */

import type { ReactNode } from 'react';

import { Card, CardHeader, Skeleton, cn } from '@reliance/ui';

import { describeError } from '@/lib/errors';

/** Props for {@link Panel}. */
export interface PanelProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Trailing control — usually a link to the full screen. */
  readonly action?: ReactNode;
  /** Height reserved for the body, in pixels. Match the loaded content. */
  readonly minBodyHeight: number;
  readonly loading?: boolean;
  readonly error?: unknown;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * @example
 * <Panel title="Recent activity" minBodyHeight={280} loading={feed.isPending}>
 *   …
 * </Panel>
 */
export function Panel(props: PanelProps) {
  const { title, description, action, minBodyHeight, loading, error, children, className } = props;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title={title} description={description} action={action} />
      <div className="mt-4 flex flex-1 flex-col" style={{ minHeight: `${minBodyHeight}px` }}>
        {loading ? (
          <Skeleton
            shape="block"
            className="h-full w-full"
            style={{ minHeight: `${minBodyHeight}px` }}
          />
        ) : null}
        {!loading && error ? (
          <p role="status" className="text-fg-muted text-sm">
            {describeError(error).message}
          </p>
        ) : null}
        {!loading && !error ? children : null}
      </div>
    </Card>
  );
}
