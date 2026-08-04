/**
 * A titled block of one screen.
 *
 * Screens in this console are compositions of several unrelated things — a queue, a
 * summary, a form — and an operator needs to know which is which at a glance. The panel
 * gives each one a heading and a boundary rather than leaving them to run together.
 */

'use client';

import type { ReactNode } from 'react';

import { Card, CardBody, CardHeader, cn } from '@reliance/ui';

export interface PanelProps {
  readonly title: string;
  /** One line of context, shown under the title. */
  readonly description?: string;
  /** Trailing control for this panel alone. */
  readonly action?: ReactNode;
  /** Removes the body padding, for a panel whose whole content is a table. */
  readonly flush?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

/** A headed card holding one part of a screen. */
export function Panel({ title, description, action, flush, className, children }: PanelProps) {
  return (
    <Card className={cn('flex min-w-0 flex-col', flush && 'p-0', className)}>
      <div className={cn(flush && 'p-5 pb-0')}>
        <CardHeader title={title} description={description} action={action} />
      </div>
      <CardBody className={cn('min-w-0 flex-1', flush && 'mt-3')}>{children}</CardBody>
    </Card>
  );
}
