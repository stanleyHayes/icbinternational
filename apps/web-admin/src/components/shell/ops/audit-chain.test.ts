/// <reference types="jest" />
/**
 * The audit chain check has to be right in both directions: it must catch an altered
 * event, and it must not cry tampering at a filtered list, which is what an operator
 * looks at almost all of the time.
 */

import type { AuditEvent } from '@reliance/contracts';

import { brokenLinks, isChainIntact } from './audit-chain';

function event(sequence: number, hash: string, previousHash: string): AuditEvent {
  return {
    id: `aud_${sequence}`,
    sequence,
    actorType: 'ADMIN',
    actorId: 'adm_1',
    actorName: 'Amara Boateng',
    action: 'CUSTOMER_FROZEN',
    entity: 'User',
    entityId: 'usr_1',
    changes: [],
    ipAddress: null,
    userAgent: null,
    traceId: 'trace-1',
    previousHash,
    hash,
    at: '2026-08-03T09:00:00.000Z',
  };
}

describe('brokenLinks', () => {
  it('finds nothing in a sound chain', () => {
    const events = [event(1, 'a', 'genesis'), event(2, 'b', 'a'), event(3, 'c', 'b')];
    expect(brokenLinks(events).size).toBe(0);
    expect(isChainIntact(events)).toBe(true);
  });

  it('names the event whose link does not hold', () => {
    const events = [event(1, 'a', 'genesis'), event(2, 'b', 'TAMPERED'), event(3, 'c', 'b')];
    expect([...brokenLinks(events)]).toEqual([2]);
  });

  it('checks the sequence order, not the array order', () => {
    const events = [event(3, 'c', 'b'), event(1, 'a', 'genesis'), event(2, 'b', 'WRONG')];
    expect([...brokenLinks(events)]).toEqual([2]);
  });

  it('says nothing about a filtered list, where gaps are expected', () => {
    const events = [event(4, 'd', 'c'), event(19, 's', 'r'), event(200, 'z', 'y')];
    expect(brokenLinks(events).size).toBe(0);
  });

  it('still checks adjacent pairs inside a list that also has gaps', () => {
    const events = [event(4, 'd', 'c'), event(5, 'e', 'BAD'), event(90, 'x', 'w')];
    expect([...brokenLinks(events)]).toEqual([5]);
  });

  it('cannot judge a single event', () => {
    expect(isChainIntact([event(7, 'g', 'f')])).toBe(true);
  });

  it('cannot judge an empty page', () => {
    expect(isChainIntact([])).toBe(true);
  });
});
