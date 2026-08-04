/**
 * The Badge — a static label: a product tier, a count, a category.
 *
 * Not to be confused with StatusPill, which reports the state of a *thing that changes*. The
 * distinction is worth keeping: a badge is decoration, a pill is information, and only one of
 * them needs to be announced when it updates.
 */

import { type HTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

import { SOFT_TONE, SOLID_TONE, type Tone } from './tone.js';

export type BadgeVariant = 'soft' | 'solid' | 'outline';

export type BadgeSize = 'sm' | 'md';

const SIZE: Readonly<Record<BadgeSize, string>> = {
  sm: 'h-5 px-2 text-xs',
  md: 'h-6 px-2.5 text-sm',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: Tone;
  readonly variant?: BadgeVariant;
  readonly size?: BadgeSize;
}

/**
 * @example <Badge tone="pending">Awaiting review</Badge>
 */
export function Badge({
  tone = 'neutral',
  variant = 'soft',
  size = 'sm',
  className,
  ...props
}: Readonly<BadgeProps>) {
  const toneClasses = variant === 'solid' ? SOLID_TONE[tone] : SOFT_TONE[tone];

  return (
    <span
      className={cn(
        'rounded-pill font-body inline-flex items-center gap-1 font-medium whitespace-nowrap',
        SIZE[size],
        toneClasses,
        variant === 'outline' && 'border border-current bg-transparent',
        className,
      )}
      {...props}
    />
  );
}
