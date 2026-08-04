import { type Biller, type BillerCategory } from '@reliance/contracts';

/**
 * Read access to the seeded biller directory.
 *
 * Read-only by design: the directory is foundation data written by the seed, and a feature
 * module that could edit it would let a bug in a payment path change what the bank believes
 * "Thames Water" is. The store returns the contract's `Biller` directly, because the
 * directory has no internal shape worth hiding — what is stored is exactly what is
 * published.
 */
export abstract class BillerDirectoryStore {
  /** Active billers, filtered and paged for the directory screen. */
  abstract list(query: BillerQuery): Promise<{ billers: readonly Biller[]; total: number }>;

  /** One biller by slug, whether or not it is still active. */
  abstract findById(id: string): Promise<Biller | null>;
}

export interface BillerQuery {
  readonly category?: BillerCategory;
  /** Case-insensitive substring of the biller's name. */
  readonly search?: string;
  readonly limit: number;
  /** Number of matches to skip. The directory is small and static, so an offset is safe. */
  readonly offset: number;
}
