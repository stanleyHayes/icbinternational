'use client';

/**
 * The Avatar.
 *
 * Falls back to initials rather than a generic silhouette: in a payee list, "JM" identifies
 * James Mensah, whereas twelve identical grey heads identify nobody. The image is decorative —
 * the name is always rendered next to it — so it carries an empty `alt`, which keeps a screen
 * reader from announcing "Image, James Mensah" immediately before the text "James Mensah".
 */

import { useState, type HTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE: Readonly<Record<AvatarSize, string>> = {
  xs: 'size-6 text-xs',
  sm: 'size-8 text-sm',
  md: 'size-10 text-base',
  lg: 'size-14 text-xl',
};

/** Two letters is the most that stays legible at 24px. */
const MAX_INITIALS = 2;

/** "James Mensah" → "JM"; "acme ltd" → "AL". Falls back to the first character of one-word names. */
export function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, MAX_INITIALS).map((word) => word.charAt(0));
  return letters.join('').toUpperCase();
}

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** The person or business. Used for the initials and, when needed, the accessible name. */
  readonly name: string;
  readonly src?: string;
  readonly size?: AvatarSize;
  /**
   * Set when the avatar stands alone — a header menu button, an activity stream. The name then
   * becomes the accessible label instead of being suppressed as decorative.
   */
  readonly standalone?: boolean;
}

/**
 * @example <Avatar name="James Mensah" src={payee.avatarUrl} size="sm" />
 */
export function Avatar({
  name,
  src,
  size = 'md',
  standalone = false,
  className,
  ...props
}: Readonly<AvatarProps>) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      role={standalone ? 'img' : undefined}
      aria-label={standalone ? name : undefined}
      aria-hidden={standalone ? undefined : 'true'}
      className={cn(
        'rounded-pill inline-flex shrink-0 items-center justify-center overflow-hidden',
        'bg-ink-soft font-display text-ink font-semibold select-none',
        SIZE[size],
        className,
      )}
      {...props}
    >
      {src && !failed ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initialsFrom(name)
      )}
    </span>
  );
}
