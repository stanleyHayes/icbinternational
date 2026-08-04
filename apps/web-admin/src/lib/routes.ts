/**
 * Navigation plumbing.
 *
 * Next generates its route union from the files in `app/` at build time. Almost every
 * destination this console navigates to is assembled at runtime — a customer id from a
 * search result, a saved view's stored path — and a value like that can never be a
 * member of a union of literals. Rather than scatter assertions across the console, the
 * two crossings into Next's typed router live here.
 */

'use client';

import type { UrlObject } from 'node:url';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/** The href type `next/link` accepts once typed routes have been generated. */
type RouterPath = Parameters<ReturnType<typeof useRouter>['push']>[0];

/**
 * Wraps a runtime path in the object form of a `Link` href.
 *
 * `<Link href={{ pathname }}>` is accepted whether or not typed routes are switched on,
 * which is what lets the navigation model hold plain strings.
 */
export function href(path: string): UrlObject {
  return { pathname: path };
}

/** Programmatic navigation to a path computed at runtime. */
export function useNavigate(): (path: string) => void {
  const router = useRouter();
  return useCallback((path: string) => router.push(path as RouterPath), [router]);
}

/** Programmatic navigation that replaces the current history entry. */
export function useReplace(): (path: string) => void {
  const router = useRouter();
  return useCallback((path: string) => router.replace(path as RouterPath), [router]);
}

/**
 * Whether `target` is the section the operator is currently in.
 *
 * A section stays highlighted while the operator is inside one of its records, so
 * `/customers` is active on `/customers/usr_01J…` but not on `/customers-exports`.
 */
export function isSectionActive(currentPath: string, target: string): boolean {
  if (currentPath === target) return true;
  return currentPath.startsWith(`${target}/`);
}

/** Appends a return-to parameter, preserving any query string already on the path. */
export function withParam(path: string, name: string, value: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${name}=${encodeURIComponent(value)}`;
}
