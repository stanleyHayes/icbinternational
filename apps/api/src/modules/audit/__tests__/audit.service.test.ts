import { ErrorCode } from '@reliance/contracts';

import { type ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type NewAuditEvent } from '../audit-event.repository.js';
import { genesisHash, isChainHash } from '../audit-hash.js';
import { REDACTED_PLACEHOLDER } from '../audit.constants.js';
import { AuditService } from '../audit.service.js';
import { AuditActorType } from '../audit.types.js';

const NOW = new Date('2026-02-01T12:00:00.000Z');

const ACTOR = { type: AuditActorType.ADMIN, id: 'adm_1', name: 'Root' } as const;

const INPUT = {
  actor: ACTOR,
  action: 'account.freeze',
  entity: 'account',
  entityId: 'acc_1',
  before: { status: 'ACTIVE', passwordHash: 'old-hash' },
  after: { status: 'FROZEN', passwordHash: 'new-hash' },
  traceId: 'trace-1',
};

/** A repository fake; `append` succeeds with the given event unless scripted otherwise. */
function makeRepository() {
  return {
    findLatest: jest.fn<Promise<NewAuditEvent | null>, []>().mockResolvedValue(null),
    append: jest.fn<Promise<NewAuditEvent | null>, [NewAuditEvent]>(),
    findForEntity: jest.fn<Promise<unknown[]>, [string, string, number]>(),
  };
}

function makeService(repository: ReturnType<typeof makeRepository>) {
  const clock = { now: () => NOW } as ClockService;
  return new AuditService(repository as never, clock, new IdGenerator());
}

describe('AuditService.record', () => {
  it('anchors the first event on the genesis hash at sequence 1', async () => {
    const repository = makeRepository();
    repository.append.mockImplementation((event) => Promise.resolve(event));

    const event = await makeService(repository).record(INPUT);

    expect(event.sequence).toBe(1);
    expect(event.previousHash).toBe(genesisHash());
    expect(isChainHash(event.hash)).toBe(true);
    expect(event.id).toMatch(/^aud_/);
    expect(event.at).toBe(NOW.toISOString());
  });

  it('chains a later event onto the current tail', async () => {
    const repository = makeRepository();
    repository.append.mockImplementation((event) => Promise.resolve(event));
    const service = makeService(repository);

    const first = await service.record(INPUT);
    repository.findLatest.mockResolvedValue({ sequence: 1, hash: first.hash } as NewAuditEvent);

    const second = await service.record(INPUT);

    expect(second.sequence).toBe(2);
    expect(second.previousHash).toBe(first.hash);
    expect(second.hash).not.toBe(first.hash);
  });

  it('diffs the snapshots and redacts secrets before anything is stored', async () => {
    const repository = makeRepository();
    repository.append.mockImplementation((event) => Promise.resolve(event));

    const event = await makeService(repository).record(INPUT);

    expect(event.changes).toEqual([
      { field: 'passwordHash', before: REDACTED_PLACEHOLDER, after: REDACTED_PLACEHOLDER },
      { field: 'status', before: 'ACTIVE', after: 'FROZEN' },
    ]);
  });

  it('retries on a lost sequence race and re-anchors on the new tail', async () => {
    const repository = makeRepository();
    // First attempt sees an empty tail and loses the race; the retry sees the winner's
    // event at sequence 9 and must anchor on it rather than on the stale tail.
    repository.findLatest
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ sequence: 9, hash: 'a'.repeat(64) } as NewAuditEvent);
    repository.append
      .mockResolvedValueOnce(null)
      .mockImplementation((event) => Promise.resolve(event));

    const event = await makeService(repository).record(INPUT);

    expect(repository.append).toHaveBeenCalledTimes(2);
    expect(event.sequence).toBe(10);
    expect(event.previousHash).toBe('a'.repeat(64));
  });

  it('fails with CONFLICT after losing the race on every attempt', async () => {
    const repository = makeRepository();
    repository.append.mockResolvedValue(null);

    const attempt = makeService(repository).record(INPUT);

    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });

  it('honours an allow-list for PII-dense entities', async () => {
    const repository = makeRepository();
    repository.append.mockImplementation((event) => Promise.resolve(event));

    const event = await makeService(repository).record({
      ...INPUT,
      before: { firstName: 'Grace', tier: 'GOLD' },
      after: { firstName: 'Grace', tier: 'PLATINUM' },
      allowFields: ['tier'],
    });

    expect(event.changes).toEqual([{ field: 'tier', before: 'GOLD', after: 'PLATINUM' }]);
  });
});

describe('AuditService.historyFor', () => {
  it('maps stored documents to contract DTOs', async () => {
    const repository = makeRepository();
    repository.findForEntity.mockResolvedValue([
      {
        id: 'aud_1',
        sequence: 7,
        actorType: 'ADMIN',
        actorId: 'adm_1',
        actorName: 'Root',
        action: 'account.freeze',
        entity: 'account',
        entityId: 'acc_1',
        changes: [],
        ipAddress: null,
        userAgent: null,
        traceId: 't',
        previousHash: 'p',
        hash: 'h',
        at: NOW,
      },
    ]);

    const history = await makeService(repository).historyFor('account', 'acc_1', 10);

    expect(repository.findForEntity).toHaveBeenCalledWith('account', 'acc_1', 10);
    expect(history).toHaveLength(1);
    expect(history[0]?.at).toBe(NOW.toISOString());
  });
});
