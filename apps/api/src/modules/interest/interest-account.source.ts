import { type StoredMoney } from '../../common/money/money.codec.js';

/**
 * Where the engine finds the accounts it must accrue on.
 *
 * The accounts lane owns the collection; this port is the read seam the interest engine
 * enumerates through. It exists so the engine's services — and the year fixture — run
 * against an in-memory book with no replica set, and so the shape the engine depends on
 * is declared here rather than leaked out of the accounts schema.
 *
 * Only the fields accrual needs are projected. The engine must never see a balance it
 * did not read through the ledger projection (`ledgerBalance`), and it has no business
 * knowing the customer's name, IBAN or holds.
 */
export abstract class InterestAccountSource {
  /**
   * One page of interest-bearing accounts, ordered by id ascending.
   *
   * Interest-bearing means the account was opened on a product with credit tiers — the
   * pinned `interestRateBps` is non-null — and is in a state where interest still
   * accrues: `ACTIVE`, or `DORMANT` (a dormant account is quiet, not dead; it keeps
   * earning until it is closed). Frozen and closed accounts accrue nothing here.
   *
   * @param afterId Exclusive cursor: accounts after this id. Omit for the first page.
   */
  abstract listInterestBearing(query: AccrualPageQuery): Promise<InterestBearingAccount[]>;
}

/** One page request over the interest-bearing book. */
export interface AccrualPageQuery {
  readonly afterId?: string;
  readonly limit: number;
}

/** The slice of an account the interest engine reads. */
export interface InterestBearingAccount {
  readonly id: string;
  readonly currency: string;
  /** Product identity the account was sold under; the terms lookup keys off it. */
  readonly productCode: string;
  readonly productVersion: number;
  /** The ledger-projected balance interest accrues on. */
  readonly ledgerBalance: StoredMoney;
}
