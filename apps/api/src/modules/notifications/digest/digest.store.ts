/**
 * Persistence boundary for digest buckets.
 *
 * A bucket is a customer's pending, batchable notifications and the instant the window
 * closes. It is stored rather than held in memory so a restart does not silently discard
 * a customer's afternoon.
 */

export interface DigestItem {
  readonly summary: string;
  readonly at: Date;
}

export interface DigestBucket {
  readonly userId: string;
  readonly items: readonly DigestItem[];
  /** When the accumulated items should be sent. */
  readonly dueAt: Date;
  readonly openedAt: Date;
}

export abstract class DigestStore {
  /**
   * Appends to the customer's open bucket, opening one if there is none.
   *
   * @returns the bucket as it now stands, so the caller can see whether it is full.
   */
  abstract append(input: { userId: string; item: DigestItem; dueAt: Date }): Promise<DigestBucket>;

  abstract findOpen(userId: string): Promise<DigestBucket | null>;

  /** Buckets whose window has closed, oldest first. */
  abstract findDue(now: Date, limit: number): Promise<DigestBucket[]>;

  /** Empties the bucket after it has been sent. */
  abstract clear(userId: string): Promise<void>;
}
