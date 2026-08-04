/**
 * ProgressRing — a savings goal.
 *
 * Progress is computed from bigint minor units and only becomes a number at the point it turns
 * into an arc length, so "£1,999.99 of £2,000" never rounds up to a finished goal.
 *
 * The ring is `role="img"` with a full sentence for its label rather than a bare percentage: a
 * goal is motivating because of the amounts, and "83 percent" leaves out both of them.
 */

import { type ReactNode } from 'react';

import { formatMinor, type CurrencyCode } from '@reliance/money';

import { roleVar } from '../foundation/tokens.js';
import { cn } from '../lib/cn.js';
import { toMinorUnits } from '../lib/minor-units.js';

const PERCENT = 100n;
const FULL = 100;
const VIEWBOX = 120;
const CENTRE = VIEWBOX / 2;
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Integer percentage of `target` saved, clamped to 0–100. Exact until the final truncation. */
export function savedPercent(saved: bigint, target: bigint): number {
  if (target <= 0n) return 0;
  const floor = saved < 0n ? 0n : saved;
  const capped = floor > target ? target : floor;
  return Number((capped * PERCENT) / target);
}

export type ProgressRingSize = 'sm' | 'md' | 'lg';

const SIZE: Readonly<Record<ProgressRingSize, string>> = {
  sm: 'size-20',
  md: 'size-32',
  lg: 'size-44',
};

export interface ProgressRingProps {
  /** The goal's name — "Deposit for a flat". */
  readonly label: string;
  /** Minor units saved so far. */
  readonly saved: string;
  /** Minor units targeted. */
  readonly target: string;
  readonly currency: CurrencyCode;
  readonly size?: ProgressRingSize;
  /** Replaces the default percentage in the middle — a MoneyText, a date, an icon. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * @example <ProgressRing label="Deposit" saved="1660000" target="2000000" currency="GBP" />
 */
export function ProgressRing(props: ProgressRingProps) {
  const { label, saved, target, currency, size = 'md', children, className } = props;
  const percent = savedPercent(toMinorUnits(saved), toMinorUnits(target));
  const complete = percent >= FULL;

  const description =
    `${label}: ${formatMinor(toMinorUnits(saved), currency)} saved of ` +
    `${formatMinor(toMinorUnits(target), currency)}, ${percent}% complete`;

  return (
    <div className={cn('relative inline-flex items-center justify-center', SIZE[size], className)}>
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        role="img"
        aria-label={description}
        className="size-full"
      >
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          fill="none"
          stroke={roleVar('surface-sunken')}
          strokeWidth="10"
        />
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          fill="none"
          // Green for progress, gold for a goal already met: a completed goal is a celebration,
          // and the brand reserves gold for the states worth noticing.
          stroke={complete ? roleVar('pending') : roleVar('accent')}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - percent / FULL)}
          // Start at twelve o'clock rather than three, which is where people expect a dial to begin.
          transform={`rotate(-90 ${CENTRE} ${CENTRE})`}
          className="ease-decelerate transition-[stroke-dashoffset] duration-(--rb-duration-slow)"
        />
      </svg>
      <div
        aria-hidden="true"
        className="font-display text-fg absolute flex flex-col items-center font-semibold"
      >
        {children ?? <span className="tabular-nums">{percent}%</span>}
      </div>
    </div>
  );
}
