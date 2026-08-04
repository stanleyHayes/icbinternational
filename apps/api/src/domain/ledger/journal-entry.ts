import { JournalEntryStatus, type EntryType } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { EmptyEntryError, UnbalancedEntryError } from './ledger.errors.js';
import { type Posting } from './posting.js';

/**
 * A balanced set of postings — the atomic unit of the ledger.
 *
 * The balance invariant is enforced in the constructor, so an unbalanced entry cannot be
 * constructed, let alone persisted. Every caller therefore gets the guarantee for free:
 * if you are holding a `JournalEntry`, its debits equal its credits, per currency.
 *
 * Entries are immutable. A mistake is corrected by a new, opposing entry — never by
 * editing history. That is what makes the audit trail worth having.
 */
export class JournalEntry {
  private constructor(
    readonly reference: string,
    readonly type: EntryType,
    readonly status: JournalEntryStatus,
    readonly description: string,
    /** Accounting date. May precede `bookedAt` for a back-valued item. */
    readonly valueDate: string,
    readonly bookedAt: Date,
    readonly postings: readonly Posting[],
    readonly reversesEntryId: string | null,
    readonly metadata: Readonly<Record<string, string>>,
  ) {
    Object.freeze(this);
  }

  /**
   * Builds an entry, validating the balance invariant.
   *
   * @throws {EmptyEntryError} with fewer than two postings.
   * @throws {UnbalancedEntryError} when debits and credits disagree in any currency.
   */
  static create(input: {
    reference: string;
    type: EntryType;
    description: string;
    valueDate: string;
    bookedAt: Date;
    postings: readonly Posting[];
    status?: JournalEntryStatus;
    reversesEntryId?: string | null;
    metadata?: Record<string, string>;
  }): JournalEntry {
    assertBalanced(input.postings);

    return new JournalEntry(
      input.reference,
      input.type,
      input.status ?? JournalEntryStatus.POSTED,
      input.description,
      input.valueDate,
      input.bookedAt,
      Object.freeze([...input.postings]),
      input.reversesEntryId ?? null,
      Object.freeze({ ...input.metadata }),
    );
  }

  /** Distinct currencies touched. A cross-currency entry balances in each independently. */
  get currencies(): CurrencyCode[] {
    return [...new Set(this.postings.map((posting) => posting.currency))];
  }

  /** Total debited in one currency. Equal to {@link totalCredits} by construction. */
  totalDebits(currency: CurrencyCode): Money {
    return sumWhere(this.postings, currency, (posting) => posting.isDebit);
  }

  totalCredits(currency: CurrencyCode): Money {
    return sumWhere(this.postings, currency, (posting) => posting.isCredit);
  }

  /** Postings that move a specific customer account. */
  postingsFor(accountId: string): Posting[] {
    return this.postings.filter((posting) => posting.accountId === accountId);
  }

  /** Net effect on a customer account — what their balance moves by. */
  netEffectOn(accountId: string, currency: CurrencyCode): Money {
    return this.postingsFor(accountId)
      .filter((posting) => posting.currency === currency)
      .reduce<Money>(
        (total, posting) => total.plus(posting.effectOnCustomerBalance),
        Money.zero(currency),
      );
  }

  /** Every distinct customer account this entry touches. */
  get affectedAccountIds(): string[] {
    const ids = this.postings
      .map((posting) => posting.accountId)
      .filter((id): id is string => id !== null);
    return [...new Set(ids)];
  }

  /**
   * Builds the entry that undoes this one.
   *
   * Every posting flips direction, so the reversal balances by the same construction the
   * original did. The original is left untouched and marked reversed by the repository.
   */
  buildReversal(input: {
    reference: string;
    reversesEntryId: string;
    reason: string;
    valueDate: string;
    bookedAt: Date;
  }): JournalEntry {
    return JournalEntry.create({
      reference: input.reference,
      type: this.type,
      description: `Reversal of ${this.reference}: ${input.reason}`,
      valueDate: input.valueDate,
      bookedAt: input.bookedAt,
      postings: this.postings.map((posting) => posting.reverse(`Reversal — ${posting.narrative}`)),
      reversesEntryId: input.reversesEntryId,
      metadata: { ...this.metadata, reversalReason: input.reason },
    });
  }
}

/**
 * The invariant, checked per currency.
 *
 * A cross-currency entry (an FX conversion, say) has four postings and balances twice —
 * once in each currency. Summing across currencies would let a GBP debit "balance" a USD
 * credit, which is exactly the class of bug this check exists to make impossible.
 */
function assertBalanced(postings: readonly Posting[]): void {
  const MINIMUM_POSTINGS = 2;
  if (postings.length < MINIMUM_POSTINGS) throw new EmptyEntryError();

  const currencies = new Set(postings.map((posting) => posting.currency));

  for (const currency of currencies) {
    const debits = sumWhere(postings, currency, (posting) => posting.isDebit);
    const credits = sumWhere(postings, currency, (posting) => posting.isCredit);

    if (!debits.equals(credits)) {
      throw new UnbalancedEntryError(currency, debits.amount, credits.amount);
    }
  }
}

function sumWhere(
  postings: readonly Posting[],
  currency: CurrencyCode,
  predicate: (posting: Posting) => boolean,
): Money {
  return postings
    .filter((posting) => posting.currency === currency && predicate(posting))
    .reduce<Money>((total, posting) => total.plus(posting.amount), Money.zero(currency));
}
