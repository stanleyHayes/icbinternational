'use client';

/**
 * Pagination.
 *
 * A `<nav>` with an accessible name, because a page that has two paginated lists needs them
 * distinguishable — "Transactions pagination", not two anonymous rows of numbers. The current
 * page is marked with `aria-current="page"` rather than by colour alone.
 *
 * Long ranges collapse with an ellipsis so the control does not wrap at 80 pages; the first and
 * last are always reachable, which is what people actually use a numbered pager for.
 */

import { type ReactNode } from 'react';

import { ChevronLeftIcon, ChevronRightIcon } from '../foundation/icons.js';
import { DISABLED, FOCUS_RING, TRANSITION_STATE } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

/** Pages shown either side of the current one before the range collapses. */
const WINDOW = 1;
const ELLIPSIS = 'ellipsis';

const ITEM =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-sm px-2 font-body text-sm ' +
  'text-fg-muted hover:bg-surface-sunken hover:text-fg';

/** The page numbers to render, with `'ellipsis'` marking a collapsed run. */
export function paginationRange(current: number, total: number): readonly (number | 'ellipsis')[] {
  const pages = new Set<number>([1, total]);
  for (let page = current - WINDOW; page <= current + WINDOW; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }

  const ordered = [...pages].sort((left, right) => left - right);
  return ordered.flatMap((page, index) => {
    const previous = ordered[index - 1];
    const gap = previous !== undefined && page - previous > 1;
    return gap ? [ELLIPSIS, page] : [page];
  });
}

interface StepButtonProps {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

/** Previous / next. One component so the two arrows cannot drift apart. */
function StepButton({ label, disabled, onClick, children }: StepButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(ITEM, FOCUS_RING, TRANSITION_STATE, DISABLED)}
    >
      {children}
    </button>
  );
}

interface PageListProps {
  readonly items: readonly (number | 'ellipsis')[];
  readonly page: number;
  readonly onPageChange: (page: number) => void;
}

function PageList({ items, page, onPageChange }: PageListProps) {
  return items.map((item, index) =>
    item === ELLIPSIS ? (
      // Keyed by the page that follows the gap, which is unique per collapsed run.
      <span
        key={`gap-${items[index + 1] ?? 'end'}`}
        aria-hidden="true"
        className="text-fg-subtle px-1"
      >
        …
      </span>
    ) : (
      <button
        key={item}
        type="button"
        onClick={() => onPageChange(item)}
        aria-current={item === page ? 'page' : undefined}
        aria-label={`Page ${item}`}
        className={cn(
          ITEM,
          item === page && 'bg-accent-soft text-accent font-medium',
          FOCUS_RING,
          TRANSITION_STATE,
        )}
      >
        {item}
      </button>
    ),
  );
}

export interface PaginationProps {
  /** 1-based. */
  readonly page: number;
  readonly totalPages: number;
  readonly onPageChange: (page: number) => void;
  /** Distinguishes this pager from others on the page. */
  readonly label?: string;
  readonly className?: string;
}

const DEFAULT_LABEL = 'Pagination';

/**
 * @example <Pagination page={page} totalPages={pages} onPageChange={setPage} label="Transactions" />
 */
export function Pagination({ page, totalPages, onPageChange, label, className }: PaginationProps) {
  const items = paginationRange(page, Math.max(totalPages, 1));

  return (
    <nav aria-label={label ?? DEFAULT_LABEL} className={cn('flex items-center gap-1', className)}>
      <StepButton label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeftIcon />
      </StepButton>
      <PageList items={items} page={page} onPageChange={onPageChange} />
      <StepButton
        label="Next page"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRightIcon />
      </StepButton>
    </nav>
  );
}
