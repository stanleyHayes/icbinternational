/**
 * Deterministic JSON serialisation.
 *
 * `JSON.stringify` preserves insertion order, so two objects that are equal in every way
 * that matters can serialise to different strings. For a hash chain that is fatal: an
 * event re-read from MongoDB with its keys in a different order would hash differently
 * from the one that was written, and every honest record would look tampered with.
 *
 * The rules are therefore fixed and boring: object keys ascending, arrays in their given
 * order (order is meaning in an array), `undefined` collapsed to `null` so an absent key
 * and an explicit null cannot disagree, and dates as ISO-8601 UTC.
 */

/** Serialises any value to a byte-stable string. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

function canonicalise(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value === 'object') return canonicaliseObject(value as Record<string, unknown>);
  return value;
}

function canonicaliseObject(value: Record<string, unknown>): Record<string, unknown> {
  // Code-unit order, not localeCompare: the hash must be identical in every locale and
  // every runtime, and locale-aware ordering is neither.
  const sortedKeys = Object.keys(value).sort(compareCodeUnits);
  const result: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    result[key] = canonicalise(value[key]);
  }

  return result;
}

/** Deterministic, locale-independent ordering for hash inputs. */
function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
