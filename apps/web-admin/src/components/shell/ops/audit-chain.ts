/**
 * Checking that the audit log has not been edited.
 *
 * Every event carries the hash of the one before it, so altering a single historical
 * record breaks the link at that point and every link after it. The platform verifies
 * the whole chain server-side; this checks the window the operator is actually looking
 * at, which is what lets the console mark the exact row where the story stops adding up
 * rather than only saying that something, somewhere, does not.
 *
 * A gap in the sequence is not a break. An operator filtering to one entity sees events
 * 4, 19 and 200, and their `previousHash` values legitimately point at events that are
 * not on screen — reporting those as tampering would make the warning worthless.
 */

import type { AuditEvent } from '@reliance/contracts';

/**
 * Sequence numbers whose link to the previous event does not hold.
 *
 * Only adjacent pairs are judged. Everything else is unproven from this page alone and
 * is deliberately reported as nothing rather than as a suspicion.
 */
export function brokenLinks(events: readonly AuditEvent[]): ReadonlySet<number> {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const broken = new Set<number>();

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (!previous || !current) continue;
    if (current.sequence !== previous.sequence + 1) continue;
    if (current.previousHash !== previous.hash) broken.add(current.sequence);
  }

  return broken;
}

/** True when every adjacent pair on this page links correctly. */
export function isChainIntact(events: readonly AuditEvent[]): boolean {
  return brokenLinks(events).size === 0;
}
