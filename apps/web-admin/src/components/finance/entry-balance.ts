/**
 * Adding up the two sides of a journal entry.
 *
 * Debits and credits are totalled separately and compared, rather than signed and summed,
 * because the two totals are themselves what an operator checks — an entry that balances
 * at £0 tells you nothing, and an entry whose sides are £4,300 against £4,300 tells you
 * what actually moved. The arithmetic is `bigint` throughout.
 */

import { PostingDirection, type Posting } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { subtractMinor, sumMinor } from '@/components/ops';

/** Both sides of an entry, and whether they agree. */
export interface EntryBalance {
  /** Total of every debit posting, in minor units. */
  readonly debits: string;
  /** Total of every credit posting, in minor units. */
  readonly credits: string;
  /** `debits − credits`. Zero for any entry the ledger would accept. */
  readonly difference: string;
  readonly balanced: boolean;
  /** The currency the postings share, or `null` when there are none. */
  readonly currency: CurrencyCode | null;
}

function amountsFor(postings: readonly Posting[], direction: PostingDirection): string[] {
  return postings
    .filter((posting) => posting.direction === direction)
    .map((posting) => posting.amount.amount);
}

/**
 * Totals both sides of a set of postings.
 *
 * Assumes one currency, which every journal entry in this ledger satisfies by
 * construction: an entry balances per currency, and a cross-currency movement is written
 * as two entries joined through a conversion account.
 */
export function entryBalance(postings: readonly Posting[]): EntryBalance {
  const debits = sumMinor(amountsFor(postings, PostingDirection.DEBIT));
  const credits = sumMinor(amountsFor(postings, PostingDirection.CREDIT));
  const difference = subtractMinor(debits, credits);

  return {
    debits,
    credits,
    difference,
    balanced: BigInt(difference) === 0n,
    currency: postings[0]?.amount.currency ?? null,
  };
}

/**
 * The posting on the entry that moved a customer's own account.
 *
 * A reversal has to be raised against that account rather than against the general-ledger
 * leg, so this is the piece the reversal form needs to find.
 */
export function customerLeg(postings: readonly Posting[]): Posting | null {
  return postings.find((posting) => posting.accountId !== null) ?? null;
}

/**
 * The general-ledger account the opposing leg lands on.
 *
 * Chosen as the first posting that is not the customer's own account, which for every
 * entry this ledger writes is the contra side by construction.
 */
export function contraLedgerCode(postings: readonly Posting[]): string | null {
  return postings.find((posting) => posting.accountId === null)?.ledgerAccountCode ?? null;
}
