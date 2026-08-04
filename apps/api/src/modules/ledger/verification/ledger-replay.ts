import { JournalEntryStatus } from '@reliance/contracts';
import { Money, type CurrencyCode } from '@reliance/money';

import { fromStored } from '../../../common/money/money.codec.js';
import { toDomainPosting } from '../ledger.mapper.js';
import {
  type JournalEntryRecord,
  type PostingRecord,
} from '../repositories/journal-entry.store.js';

import { type ReplayedBalance, type UnbalancedEntryFinding } from './verification.types.js';

/**
 * Rebuilds every balance in the bank from nothing but postings.
 *
 * This is the definition of a correct balance. Whatever the `chart_of_accounts` and
 * `accounts` collections happen to say, *this* is what they should say, and the gap
 * between the two is drift. Keeping the rebuild here — pure, incremental, no I/O — means
 * it can be fed a batch at a time and can therefore replay a book of any size in constant
 * memory relative to the number of entries.
 *
 * The class is deliberately framework-free. It is the ledger's conscience and it should
 * be testable in a millisecond.
 */
export class LedgerReplay {
  private readonly ledgerTotals = new Map<string, ReplayedBalance>();
  private readonly customerTotals = new Map<string, ReplayedBalance>();
  private readonly findings: UnbalancedEntryFinding[] = [];
  private scanned = 0;

  /**
   * Folds one entry into the running totals.
   *
   * `PENDING` entries are skipped: they represent an intent that has not moved a balance,
   * so counting them would manufacture drift rather than detect it. `REVERSED` entries
   * are *not* skipped — their postings really happened, and the entry that undid them is
   * a separate record that will be folded in on its own.
   */
  add(record: JournalEntryRecord): void {
    if (record.status === JournalEntryStatus.PENDING) return;

    this.scanned += 1;
    this.collectImbalance(record);

    for (const posting of record.postings) {
      this.applyPosting(posting);
    }
  }

  get entriesScanned(): number {
    return this.scanned;
  }

  /** Entries whose stored postings no longer add up. Should always be empty. */
  get unbalancedEntries(): readonly UnbalancedEntryFinding[] {
    return this.findings;
  }

  /** Rebuilt general-ledger balances, one per account and currency. */
  ledgerBalances(): ReplayedBalance[] {
    return [...this.ledgerTotals.values()];
  }

  /** Rebuilt customer balances, one per account and currency. */
  customerBalances(): ReplayedBalance[] {
    return [...this.customerTotals.values()];
  }

  private applyPosting(posting: PostingRecord): void {
    const domain = toDomainPosting(posting);

    accumulate(this.ledgerTotals, posting.ledgerAccountCode, domain.effectOnLedgerAccount);

    if (posting.accountId !== null) {
      accumulate(this.customerTotals, posting.accountId, domain.effectOnCustomerBalance);
    }
  }

  /**
   * Re-checks the balance invariant against what is actually on disk.
   *
   * The domain makes an unbalanced entry impossible to construct, so a finding here means
   * the bytes changed after they were written — a bad migration, a repair script, a
   * direct shell write. That is exactly the class of damage a verifier exists to surface,
   * and it is invisible to every other check in the system.
   */
  private collectImbalance(record: JournalEntryRecord): void {
    for (const currency of currenciesIn(record.postings)) {
      const debits = sumSide(record.postings, currency, true);
      const credits = sumSide(record.postings, currency, false);
      if (debits.equals(credits)) continue;

      this.findings.push({
        entryId: record.id,
        reference: record.reference,
        currency,
        debits: debits.amount.toString(),
        credits: credits.amount.toString(),
      });
    }
  }
}

const KEY_SEPARATOR = '|';

function accumulate(totals: Map<string, ReplayedBalance>, target: string, effect: Money): void {
  const key = `${target}${KEY_SEPARATOR}${effect.currency}`;
  const running = totals.get(key);

  totals.set(key, {
    target,
    currency: effect.currency,
    balance: running ? running.balance.plus(effect) : effect,
  });
}

function currenciesIn(postings: readonly PostingRecord[]): CurrencyCode[] {
  return [...new Set(postings.map((posting) => fromStored(posting.amount).currency))];
}

function sumSide(
  postings: readonly PostingRecord[],
  currency: CurrencyCode,
  debit: boolean,
): Money {
  return postings
    .map((posting) => toDomainPosting(posting))
    .filter((posting) => posting.currency === currency && posting.isDebit === debit)
    .reduce<Money>((total, posting) => total.plus(posting.amount), Money.zero(currency));
}
