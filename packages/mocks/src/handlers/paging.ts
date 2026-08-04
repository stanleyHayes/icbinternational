/**
 * Cursor pagination for the mock lists.
 *
 * Real cursors, not offsets dressed up as cursors: the cursor encodes the id of the last
 * item returned, and the next page starts after it. A UI built against fake cursors —
 * `cursor=2`, `cursor=3` — will silently break the first time it meets a real one that
 * is an opaque base64 blob.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type PageInfo } from '@reliance/contracts';

import type { MockResult } from './kit.js';
import { Status } from './kit.js';

/** Anything with an id can be paged. */
export interface Identified {
  readonly id: string;
}

/** Reads `limit` from the query, clamped to the contract's bounds. */
export function readLimit(query: URLSearchParams): number {
  const raw = Number(query.get('limit') ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(raw)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(raw), 1), MAX_PAGE_SIZE);
}

/** Encodes an item id as an opaque cursor. */
export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

/** Decodes a cursor back to an item id. Returns null when it is unreadable. */
export function decodeCursor(cursor: string | null): string | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

/** Slices a list into a contract page envelope. */
export function paginate<T extends Identified>(
  items: readonly T[],
  query: URLSearchParams,
  options: { includeTotal?: boolean } = {},
): MockResult {
  const limit = readLimit(query);
  const afterId = decodeCursor(query.get('cursor'));
  const startIndex = afterId === null ? 0 : indexAfter(items, afterId);
  const window = items.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < items.length;
  const last = window.at(-1);

  const page: PageInfo = {
    cursor: hasMore && last ? encodeCursor(last.id) : null,
    limit,
    hasMore,
    ...(options.includeTotal === true ? { total: items.length } : {}),
  };

  return { status: Status.OK, body: { data: window, page } };
}

/**
 * A page whose items have no `id` — the fee schedule, deposit rates, report lines.
 *
 * These lists are short and fixed, so they are returned whole with an exhausted cursor
 * rather than being given synthetic ids purely to satisfy the pager.
 */
export function paginateStatic<T>(items: readonly T[]): MockResult {
  const page: PageInfo = {
    cursor: null,
    limit: items.length === 0 ? DEFAULT_PAGE_SIZE : items.length,
    hasMore: false,
    total: items.length,
  };
  return { status: Status.OK, body: { data: items, page } };
}

function indexAfter<T extends Identified>(items: readonly T[], afterId: string): number {
  const found = items.findIndex((item) => item.id === afterId);
  return found === -1 ? items.length : found + 1;
}
