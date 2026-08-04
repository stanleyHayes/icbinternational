/**
 * The frame every workstation in this lane shares.
 *
 * A queue screen is a title, a sentence saying what the operator is looking at, the
 * actions that apply to the whole queue, and then the work. Making that a component
 * rather than a convention means the heading level, the landmark and the spacing are the
 * same on all nine of them, so an operator moving from identity review to disputes does
 * not have to re-find the controls.
 *
 * The description is not decoration. An analyst inheriting a queue mid-shift needs to
 * know what is in it and what clearing it means, and there is nowhere else to say so.
 */

'use client';

import type { ReactNode } from 'react';

import { cn } from '@reliance/ui';

/** Fills the console's main region and scrolls its body, keeping the header in place. */
const SCREEN = 'flex h-full min-h-0 flex-col gap-4 p-4 lg:p-6';

export interface ConsoleScreenProps {
  readonly title: string;
  /** One or two sentences on what this queue is and what clearing it commits the bank to. */
  readonly description: string;
  /** Queue-wide actions — an export, a bulk decision, a "new" control. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** A workstation screen: heading, purpose, actions, work. */
export function ConsoleScreen({ title, description, actions, children }: ConsoleScreenProps) {
  return (
    <div className={SCREEN}>
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

export interface ScreenPanelProps {
  /** Visible heading for the panel. Rendered as an `h2` under the screen's title. */
  readonly title: string;
  /** Right-aligned controls belonging to this panel alone. */
  readonly actions?: ReactNode;
  /** Removes the body padding, for a panel whose child is a full-bleed table. */
  readonly flush?: boolean;
  readonly children: ReactNode;
}

/** A titled region inside a screen. */
export function ScreenPanel({ title, actions, flush, children }: ScreenPanelProps) {
  return (
    <section className="border-border bg-surface flex min-h-0 flex-col rounded-md border">
      <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="font-body text-fg text-sm font-semibold">{title}</h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={flush ? 'min-h-0 flex-1 overflow-auto' : 'min-h-0 flex-1 overflow-auto p-4'}>
        {children}
      </div>
    </section>
  );
}

export interface MetricTileProps {
  readonly label: string;
  readonly value: string;
  /** A second line qualifying the figure — "of which 4 breach today". */
  readonly detail?: string;
  /** Marks the tile as the one demanding attention. Never the only signal: the detail says why. */
  readonly urgent?: boolean;
}

const TILE = 'flex flex-col gap-0.5 rounded-md border p-3';

/** One figure at the head of a queue, for the counts an operator triages on. */
export function MetricTile({ label, value, detail, urgent }: MetricTileProps) {
  return (
    <div className={cn(TILE, urgent ? 'border-danger bg-danger-soft' : 'border-border bg-surface')}>
      <span className="font-body text-fg-subtle text-xs font-medium tracking-wider uppercase">
        {label}
      </span>
      <span className="font-display text-fg text-2xl font-semibold tabular-nums">{value}</span>
      {detail && <span className="font-body text-fg-muted text-xs">{detail}</span>}
    </div>
  );
}

/** A responsive row of {@link MetricTile}s. */
export function MetricRow({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
