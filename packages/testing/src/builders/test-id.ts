/**
 * Prefixed-ULID test identifiers matching the contract `entityId` pattern.
 *
 * ULIDs are time-ordered, so two builds in one suite never collide. Snapshot tests
 * should pin the id with the builder's `withId` override instead of snapshotting a
 * generated one.
 */

import { ulid } from 'ulid';

/** Returns a public identifier for `prefix`, e.g. `testId('acc')` → `acc_01JQ8Z…`. */
export function testId(prefix: string): string {
  return `${prefix}_${ulid()}`;
}
