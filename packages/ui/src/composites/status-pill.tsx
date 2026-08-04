/**
 * The StatusPill — the current state of something that moves: a payment, a card, a KYC case.
 *
 * Two rules it exists to enforce. First, the state is always spelled out in words; the dot is a
 * scanning aid, never the message, because roughly one man in twelve cannot separate the green
 * from the red. Second, when the status is *live* it is announced: a transfer that silently flips
 * from "Pending" to "Settled" is a change the user needed to hear about.
 */

import { type HTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

import { DOT_TONE, SOFT_TONE, type Tone } from './tone.js';

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: Tone;
  /** The state, in words. Required — the colour is not the label. */
  readonly label: string;
  /**
   * Set when the status can change while the user is looking at it. Adds a polite live region
   * and a pulsing dot. Leave off for historical records: a settled payment from March is not news.
   */
  readonly live?: boolean;
}

/**
 * @example <StatusPill tone="pending" label="Pending" live />
 */
export function StatusPill({
  tone = 'neutral',
  label,
  live = false,
  className,
  ...props
}: Readonly<StatusPillProps>) {
  return (
    <span
      aria-live={live ? 'polite' : undefined}
      className={cn(
        'rounded-pill font-body inline-flex h-6 items-center gap-1.5 px-2.5 text-sm font-medium',
        SOFT_TONE[tone],
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn('rounded-pill size-1.5 shrink-0', DOT_TONE[tone], live && 'animate-pulse')}
      />
      {label}
    </span>
  );
}
