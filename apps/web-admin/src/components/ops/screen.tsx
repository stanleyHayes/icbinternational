/**
 * The frame every operational screen sits in.
 *
 * One heading, one sentence saying what the screen is for, and the screen's own actions
 * on the same line. The sentence is not decoration: an operator moved onto a queue they
 * have never worked needs to know what clearing it means before they clear anything, and
 * a training document nobody opens does not do that job.
 */

'use client';

import type { ReactNode } from 'react';

export interface OpsScreenProps {
  readonly title: string;
  /** What the screen is for, in one sentence. */
  readonly description: string;
  /** Screen-level controls, aligned with the heading. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** Heading, description and body for one console screen. */
export function OpsScreen({ title, description, actions, children }: OpsScreenProps) {
  return (
    <div className="flex min-h-full flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-fg text-xl font-semibold">{title}</h1>
          <p className="font-body text-fg-muted max-w-3xl text-sm">{description}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/** A responsive grid for tiles and side-by-side panels. */
export function OpsGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

/** Two columns on a wide screen, stacked on a narrow one. */
export function OpsColumns({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-4 lg:grid-cols-2">{children}</div>;
}
