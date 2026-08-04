import { computeAuditHash, genesisHash, isChainHash } from '../audit-hash.js';
import { GENESIS_HASH, HASH_HEX_LENGTH } from '../audit.constants.js';
import { type HashableAuditEvent } from '../audit.types.js';

const EVENT: HashableAuditEvent = {
  id: 'aud_01J00000000000000000000000',
  sequence: 1,
  actorType: 'CUSTOMER',
  actorId: 'usr_1',
  actorName: 'Grace',
  action: 'account.freeze',
  entity: 'account',
  entityId: 'acc_1',
  changes: [{ field: 'status', before: 'ACTIVE', after: 'FROZEN' }],
  ipAddress: null,
  userAgent: null,
  traceId: 'trace-1',
  at: '2026-01-01T00:00:00.000Z',
};

describe('computeAuditHash', () => {
  it('is deterministic for the same input', () => {
    expect(computeAuditHash(genesisHash(), EVENT)).toBe(computeAuditHash(genesisHash(), EVENT));
  });

  it('produces a 64-character lowercase hex digest', () => {
    expect(computeAuditHash(genesisHash(), EVENT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any covered field changes', () => {
    const original = computeAuditHash(genesisHash(), EVENT);
    const edited = computeAuditHash(genesisHash(), { ...EVENT, actorName: 'Mallory' });

    expect(edited).not.toBe(original);
  });

  it('changes when the previous hash changes — the link in the chain', () => {
    const first = computeAuditHash(genesisHash(), EVENT);
    const second = computeAuditHash(first, { ...EVENT, sequence: 2 });

    expect(second).not.toBe(first);
    expect(computeAuditHash(first, { ...EVENT, sequence: 2 })).not.toBe(
      computeAuditHash(genesisHash(), { ...EVENT, sequence: 2 }),
    );
  });
});

describe('isChainHash', () => {
  it('accepts a well-formed digest and rejects anything else', () => {
    expect(isChainHash(computeAuditHash(genesisHash(), EVENT))).toBe(true);
    expect(isChainHash('abc')).toBe(false);
    expect(isChainHash('Z'.repeat(HASH_HEX_LENGTH))).toBe(false);
    expect(isChainHash(null)).toBe(false);
    expect(isChainHash(42)).toBe(false);
  });
});

describe('genesisHash', () => {
  it('is the all-zero anchor, never a record', () => {
    expect(genesisHash()).toBe(GENESIS_HASH);
    expect(genesisHash()).toBe('0'.repeat(HASH_HEX_LENGTH));
  });
});
