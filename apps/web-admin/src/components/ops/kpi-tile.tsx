/**
 * One headline figure.
 *
 * The figure is announced politely when it can change under the operator, because a
 * balance that updates silently is a balance a screen-reader user never learns about.
 * Colour never carries the meaning on its own — every tone here sits beside a word.
 */

'use client';

import type { ReactNode } from 'react';

import { Card, cn, type Tone } from '@reliance/ui';

const TONE_TEXT: Readonly<Record<Tone, string>> = {
  neutral: 'text-fg',
  accent: 'text-accent',
  credit: 'text-credit',
  debit: 'text-debit',
  pending: 'text-pending',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

export interface KpiTileProps {
  readonly label: string;
  /** The figure itself. Money must be a `MoneyText`, never a formatted string. */
  readonly value: ReactNode;
  /** One line qualifying the figure — the window it covers, or what it excludes. */
  readonly hint?: string;
  readonly tone?: Tone;
  /** Announces the value politely when it updates. Use for anything that moves live. */
  readonly live?: boolean;
  /** Leading glyph. Decorative; the label carries the meaning. */
  readonly icon?: ReactNode;
}

/** A single number, labelled and qualified. */
export function KpiTile({ label, value, hint, tone = 'neutral', live, icon }: KpiTileProps) {
  return (
    <Card className="flex flex-col gap-1.5">
      <div className="font-body text-fg-subtle flex items-center gap-2 text-xs font-medium tracking-wider uppercase">
        {icon && (
          <span aria-hidden="true" className="text-fg-subtle">
            {icon}
          </span>
        )}
        {label}
      </div>
      <div
        aria-live={live ? 'polite' : undefined}
        className={cn('font-display text-2xl font-semibold tabular-nums', TONE_TEXT[tone])}
      >
        {value}
      </div>
      {hint && <p className="font-body text-fg-muted text-xs">{hint}</p>}
    </Card>
  );
}
