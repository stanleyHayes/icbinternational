import { MAX_FLATTEN_DEPTH } from './audit.constants.js';
import { type AuditChange } from './audit.types.js';
import { canonicalJson } from './canonical-json.js';

/**
 * Turning two object snapshots into a field-level diff.
 *
 * An audit row that says "the account was updated" is worthless during an investigation.
 * What an investigator needs is "`status` went from ACTIVE to FROZEN, `frozenReason` went
 * from null to 'AML case 42'". So snapshots are flattened to dotted paths and compared
 * path by path, and only paths that actually moved are recorded — an unchanged field in
 * the payload is noise that hides the one field that mattered.
 *
 * Values are compared as their canonical string form. That is what gets stored anyway,
 * and it makes `1` and `"1"` compare equal, which is the right answer here: the point is
 * whether the recorded state changed, not whether the driver decoded it the same way.
 */

/** Flattens nested objects to dotted paths. Arrays are kept whole. */
export function flattenSnapshot(snapshot: Record<string, unknown>): Map<string, string | null> {
  const flat = new Map<string, string | null>();
  collect(snapshot, '', flat, 0);
  return flat;
}

function collect(
  value: Record<string, unknown>,
  prefix: string,
  into: Map<string, string | null>,
  depth: number,
): void {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(child) && depth < MAX_FLATTEN_DEPTH) {
      collect(child, path, into, depth + 1);
      continue;
    }

    into.set(path, stringifyValue(child));
  }
}

/**
 * An array is stored as one value rather than as `tags.0`, `tags.1`, …
 *
 * Indexed paths make a reordered list look like every element changed, which buries the
 * real edit under a wall of false differences.
 */
function stringifyValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();

  return canonicalJson(value);
}

/**
 * Only literal objects are descended into.
 *
 * A class instance — a Mongoose document, a `Money` — is stored as one canonical value.
 * Walking its prototype chain would record internal bookkeeping fields as if they were
 * business state. Callers holding a document pass `.toObject()`.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Diffs two snapshots, either of which may be absent.
 *
 * A missing `before` describes a creation and a missing `after` describes a deletion;
 * both are recorded as changes against `null` rather than being skipped, because "the
 * record appeared" is itself the fact worth auditing.
 */
export function diffSnapshots(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditChange[] {
  const previous = before ? flattenSnapshot(before) : new Map<string, string | null>();
  const next = after ? flattenSnapshot(after) : new Map<string, string | null>();

  const paths = [...new Set([...previous.keys(), ...next.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );

  return paths
    .map((field) => ({
      field,
      before: previous.get(field) ?? null,
      after: next.get(field) ?? null,
    }))
    .filter((change) => change.before !== change.after);
}
