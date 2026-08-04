'use client';

/**
 * What a route shows while it loads.
 *
 * Skeletons rather than a spinner, and skeletons shaped like the thing that is coming: a heading
 * bar, then rows. The point is not decoration, it is that the layout does not jump when the real
 * content lands. A page that reflows the instant a balance appears is a page where somebody
 * clicked the wrong row.
 *
 * Drop it into any `loading.tsx`:
 *
 * ```tsx
 * import { RouteLoading } from '@/components/shell';
 * export default function Loading() { return <RouteLoading rows={6} />; }
 * ```
 */

import { Skeleton, SkeletonText } from '@reliance/ui';

const DEFAULT_ROWS = 5;

/** Props for {@link RouteLoading}. */
export interface RouteLoadingProps {
  /** How many list rows to sketch. Match the page's usual density. */
  readonly rows?: number;
  /** Hide the heading block where the page header is already rendered above the boundary. */
  readonly withHeader?: boolean;
}

/** A skeleton of a typical application screen. */
export function RouteLoading({ rows = DEFAULT_ROWS, withHeader = true }: RouteLoadingProps) {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label="Loading this page"
    >
      {withHeader ? (
        <div className="border-border flex flex-col gap-3 border-b pb-5">
          <Skeleton className="h-8 w-56" />
          <SkeletonText lines={1} className="max-w-md" />
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_unused, index) => `row-${index}`).map((rowKey) => (
          <div
            key={rowKey}
            className="border-border bg-surface flex items-center gap-4 rounded-lg border p-4"
          >
            <Skeleton shape="circle" className="size-10 shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="mt-2 h-3 w-1/4" />
            </div>
            <Skeleton className="h-5 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
