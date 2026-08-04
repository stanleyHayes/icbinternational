/**
 * The Skeleton — a placeholder shaped like the content that is coming.
 *
 * It exists to hold layout, which is the whole point: a dashboard that renders its balance into
 * a space that was not reserved shifts every card below it, and the user taps the wrong one. The
 * placeholder is `aria-hidden` and the region that owns it should carry `aria-busy`, because
 * announcing "loading, loading, loading" once per grey rectangle helps nobody.
 */

import { type HTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

export type SkeletonShape = 'text' | 'block' | 'circle';

const SHAPE: Readonly<Record<SkeletonShape, string>> = {
  text: 'h-4 rounded-sm',
  block: 'rounded-md',
  circle: 'rounded-pill',
};

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  readonly shape?: SkeletonShape;
}

/**
 * @example <Skeleton shape="text" className="w-32" />
 */
export function Skeleton({ shape = 'text', className, ...props }: Readonly<SkeletonProps>) {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-skeleton animate-pulse', SHAPE[shape], className)}
      {...props}
    />
  );
}

export interface SkeletonTextProps extends Omit<SkeletonProps, 'shape'> {
  /** Number of lines. The last one is shortened, which is what makes it read as prose. */
  readonly lines?: number;
}

const DEFAULT_LINES = 3;

/** A paragraph-shaped placeholder. */
export function SkeletonText({
  lines = DEFAULT_LINES,
  className,
  ...props
}: Readonly<SkeletonTextProps>) {
  const rows = Array.from({ length: lines }, (_, index) => `line-${index}`);

  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      {rows.map((row, index) => (
        <Skeleton
          key={row}
          shape="text"
          className={index === rows.length - 1 ? 'w-2/3' : 'w-full'}
        />
      ))}
    </div>
  );
}
