import {
  checkChainLink,
  verifyAuditChain,
  type ChainBatchReader,
} from '../audit-chain.verifier.js';
import { computeAuditHash, genesisHash } from '../audit-hash.js';
import { GENESIS_HASH } from '../audit.constants.js';
import { type StoredSource, toHashable } from '../audit.mapper.js';

const CHECKED_AT = '2026-02-01T00:00:00.000Z';

/** Builds a sound chain of `length` events, each anchored on its predecessor. */
function buildChain(length: number): StoredSource[] {
  const events: StoredSource[] = [];
  let previousHash = genesisHash();

  for (let sequence = 1; sequence <= length; sequence += 1) {
    const unsigned = {
      id: `aud_test_${sequence}`,
      sequence,
      actorType: 'CUSTOMER' as const,
      actorId: 'usr_1',
      actorName: 'Grace',
      action: 'account.freeze',
      entity: 'account',
      entityId: 'acc_1',
      changes: [{ field: 'status', before: 'ACTIVE', after: 'FROZEN' }],
      ipAddress: null,
      userAgent: null,
      traceId: `trace-${sequence}`,
      at: '2026-01-01T00:00:00.000Z',
    };
    const hash = computeAuditHash(previousHash, toHashable(unsigned));
    events.push({ ...unsigned, previousHash, hash });
    previousHash = hash;
  }

  return events;
}

/** Pages an in-memory chain exactly the way the repository would. */
function readerOf(events: StoredSource[]): ChainBatchReader {
  return (fromSequence, limit) =>
    Promise.resolve(events.filter((event) => event.sequence >= fromSequence).slice(0, limit));
}

describe('verifyAuditChain', () => {
  it('accepts an empty chain — the genesis anchor alone is sound', async () => {
    const report = await verifyAuditChain(readerOf([]), CHECKED_AT);

    expect(report).toEqual({
      verified: true,
      eventsChecked: 0,
      firstBrokenSequence: null,
      reason: null,
      checkedAt: CHECKED_AT,
    });
  });

  it('accepts a sound chain', async () => {
    const report = await verifyAuditChain(readerOf(buildChain(5)), CHECKED_AT);

    expect(report.verified).toBe(true);
    expect(report.eventsChecked).toBe(5);
  });

  it('flags an event whose contents were edited after it was written', async () => {
    const chain = buildChain(3);
    const tampered = chain.map((event) =>
      event.sequence === 2 ? { ...event, actorName: 'Mallory' } : event,
    );

    const report = await verifyAuditChain(readerOf(tampered), CHECKED_AT);

    expect(report.verified).toBe(false);
    expect(report.firstBrokenSequence).toBe(2);
    expect(report.reason).toContain('contents');
  });

  it('flags an edited event even when the editor recomputed its own hash', async () => {
    const chain = buildChain(3);
    const edited = { ...chain[1]!, actorName: 'Mallory' };
    const rehashed = {
      ...edited,
      hash: computeAuditHash(edited.previousHash, toHashable(edited)),
    };
    const tampered = [chain[0]!, rehashed, chain[2]!];

    const report = await verifyAuditChain(readerOf(tampered), CHECKED_AT);

    // Event 2 is internally consistent, but event 3 still points at the original hash.
    expect(report.verified).toBe(false);
    expect(report.firstBrokenSequence).toBe(3);
    expect(report.reason).toContain('previousHash');
  });

  it('flags a deleted event as a sequence gap', async () => {
    const chain = buildChain(3);
    const missing = [chain[0]!, chain[2]!];

    const report = await verifyAuditChain(readerOf(missing), CHECKED_AT);

    expect(report.verified).toBe(false);
    expect(report.firstBrokenSequence).toBe(3);
    expect(report.reason).toContain('gap');
  });

  it('flags a chain that does not start at the genesis anchor', async () => {
    const [first, ...rest] = buildChain(2);
    const detached = [{ ...first!, previousHash: 'f'.repeat(64) }, ...rest];

    const report = await verifyAuditChain(readerOf(detached), CHECKED_AT);

    expect(report.verified).toBe(false);
    expect(report.firstBrokenSequence).toBe(1);
  });
});

describe('checkChainLink', () => {
  it('returns null for a sound link', () => {
    const [first] = buildChain(1);

    expect(checkChainLink(first!, { sequence: 1, previousHash: GENESIS_HASH })).toBeNull();
  });

  it('names the expected and found positions on a gap', () => {
    const [first] = buildChain(1);
    const reason = checkChainLink(first!, { sequence: 7, previousHash: GENESIS_HASH });

    expect(reason).toContain('expected sequence 7');
    expect(reason).toContain('found 1');
  });
});
