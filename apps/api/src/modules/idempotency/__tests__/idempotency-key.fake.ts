import { ClockService } from '../../../common/clock/clock.service.js';
import { type IdempotencyKeyRepository, type KeyScope } from '../idempotency-key.repository.js';
import { IdempotencyStatus } from '../idempotency-key.schema.js';
import { IdempotencyService } from '../idempotency.service.js';

/**
 * An in-memory stand-in for the keys collection.
 *
 * It exists to model **one** thing faithfully: the compound unique index. `claim` returns
 * false whenever the `{key, userId}` pair is already present, exactly as MongoDB's index
 * does, and it does so synchronously with respect to the JavaScript event loop — which is
 * what lets a test fire two concurrent requests and prove that only one gets through.
 *
 * A fake that resolved on a later tick would let both claims see an empty map and both
 * succeed, and the test would prove nothing about the behaviour that matters.
 */
export class FakeIdempotencyKeyRepository {
  private readonly rows = new Map<string, StoredRow>();

  /** Counts how often the unique index rejected a claim, for assertions. */
  rejectedClaims = 0;

  async claim(input: KeyScope & { requestHash: string }): Promise<boolean> {
    const id = keyOf(input);
    if (this.rows.has(id)) {
      this.rejectedClaims += 1;
      return false;
    }

    this.rows.set(id, {
      key: input.key,
      userId: input.userId,
      requestHash: input.requestHash,
      status: IdempotencyStatus.IN_FLIGHT,
      responseStatus: null,
      responseBody: null,
    });
    return true;
  }

  async find(scope: KeyScope): Promise<StoredRow | null> {
    return this.rows.get(keyOf(scope)) ?? null;
  }

  async complete(
    input: KeyScope & { responseStatus: number; responseBody: unknown },
  ): Promise<void> {
    const row = this.rows.get(keyOf(input));
    if (!row) return;

    this.rows.set(keyOf(input), {
      ...row,
      status: IdempotencyStatus.COMPLETED,
      responseStatus: input.responseStatus,
      responseBody: input.responseBody,
    });
  }

  async release(scope: KeyScope): Promise<void> {
    const row = this.rows.get(keyOf(scope));
    if (row?.status === IdempotencyStatus.IN_FLIGHT) this.rows.delete(keyOf(scope));
  }

  get size(): number {
    return this.rows.size;
  }
}

export interface StoredRow {
  key: string;
  userId: string;
  requestHash: string;
  status: IdempotencyStatus;
  responseStatus: number | null;
  responseBody: unknown;
}

function keyOf(scope: KeyScope): string {
  return `${scope.userId}::${scope.key}`;
}

/** A service wired to the fake, plus the fake itself for assertions. */
export function makeIdempotencyService(): {
  service: IdempotencyService;
  repository: FakeIdempotencyKeyRepository;
} {
  const repository = new FakeIdempotencyKeyRepository();
  const clock = new ClockService();
  const service = new IdempotencyService(repository as unknown as IdempotencyKeyRepository, clock);

  return { service, repository };
}
