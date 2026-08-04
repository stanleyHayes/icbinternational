/**
 * Reading typed fragments out of an untyped request body.
 */

import type { Money } from '@reliance/contracts';

/**
 * Reads a `Money` off a request body.
 *
 * Bodies arrive as `unknown` because MSW hands over whatever the caller sent, and a mock
 * that trusted the shape would throw on a malformed request instead of answering with the
 * validation error the real API would return.
 */
export function readMoney(body: unknown, key: string): Money | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Money;
  return typeof candidate.amount === 'string' ? candidate : null;
}
