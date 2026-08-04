import { DEFAULT_PAGE_SIZE, type PageInfo } from '@reliance/contracts';

/**
 * Cursor pagination.
 *
 * Offsets are wrong for a transaction feed: rows arrive constantly, so page two of an
 * offset query either repeats or skips items that shifted while the customer was reading
 * page one. Cursors are anchored to a record, so the page boundary is stable.
 *
 * The cursor is an opaque base64url string. Clients must not decode or construct one —
 * treating it as opaque is what lets the sort key change without breaking them.
 */

export interface CursorPayload {
  /** Primary sort value, usually an ISO timestamp. */
  readonly sortValue: string;
  /** Tie-breaker so records sharing a timestamp still have a total order. */
  readonly id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(`${payload.sortValue}|${payload.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const [sortValue, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!sortValue || !id) return null;
    return { sortValue, id };
  } catch {
    return null;
  }
}

export interface PageResult<T> {
  data: T[];
  page: PageInfo;
}

/**
 * Turns an over-fetched result set into a page.
 *
 * The caller queries `limit + 1` records; the extra one is not returned but proves there
 * is a next page without a second count query.
 */
export function buildPage<T>(options: {
  records: T[];
  limit: number;
  toCursor: (record: T) => CursorPayload;
  total?: number;
}): PageResult<T> {
  const limit = options.limit > 0 ? options.limit : DEFAULT_PAGE_SIZE;
  const hasMore = options.records.length > limit;
  const data = hasMore ? options.records.slice(0, limit) : options.records;
  const last = data.at(-1);

  return {
    data,
    page: {
      cursor: hasMore && last ? encodeCursor(options.toCursor(last)) : null,
      limit,
      hasMore,
      ...(options.total === undefined ? {} : { total: options.total }),
    },
  };
}
