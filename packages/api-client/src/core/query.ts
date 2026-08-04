/**
 * Query-string construction.
 *
 * `undefined` and `null` are dropped rather than serialised. A filter the user has not
 * set must not appear in the URL at all: `?status=undefined` is a string the API will
 * reject with `VALIDATION_FAILED`, and the customer will see a broken screen instead of
 * an unfiltered list.
 */

import type { QueryParams, QueryValue } from './types.js';

/** Serialises parameters into a `?a=1&b=2` string, or `''` when nothing survives. */
export function buildQueryString(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) appendParam(search, key, value);
  const serialised = search.toString();
  return serialised === '' ? '' : `?${serialised}`;
}

function appendParam(search: URLSearchParams, key: string, value: QueryValue): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) search.append(key, String(item));
    return;
  }
  search.append(key, String(value));
}

/**
 * Joins a base URL with a path.
 *
 * Written by hand rather than with `new URL(path, base)` because that helper treats a
 * leading slash as "replace the whole path", which would silently drop the `/v1` prefix
 * every route in this client depends on.
 */
export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
