/**
 * Small, validated reads and writes against `sessionStorage`.
 *
 * Two rules, both learned the hard way. Storage can throw — Safari in a locked-down private window
 * refuses `setItem` outright — so nothing here is allowed to take a screen down with it. And
 * anything read back is parsed against a schema, because the value on disk was written by whatever
 * build of this app the customer last loaded, and a wizard that crashes on a renamed field is a
 * wizard that cannot be deployed twice.
 */

import type { ZodType } from 'zod';

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Reads a stored value and validates it.
 *
 * @returns the value, or `null` when it is absent, unparseable or no longer matches the schema.
 */
export function readStored<T>(key: string, schema: ZodType<T>): T | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Stores a value. A refusal by the browser is not an error the customer needs to see. */
export function writeStored(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience here, never the source of truth. The task continues without it.
  }
}

/** Removes a stored value. */
export function clearStored(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to recover: the value either is not there or cannot be reached.
  }
}
