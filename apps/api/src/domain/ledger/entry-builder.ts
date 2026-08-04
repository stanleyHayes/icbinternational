import { type EntryType } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { GL } from './chart-of-accounts.js';
import { JournalEntry } from './journal-entry.js';
import { Posting } from './posting.js';

/**
 * Fluent construction of the entry shapes the bank actually books.
 *
 * Hand-writing four postings for every transfer is where double-entry bugs come from.
 * These helpers express the intent — "move money between two customer accounts", "charge
 * a fee" — and produce the correct pair of legs, so the caller cannot get the direction
 * or the counterparty GL account wrong.
 */
export class EntryBuilder {
  private readonly postings: Posting[] = [];

  private constructor(
    private readonly reference: string,
    private readonly type: EntryType,
    private readonly description: string,
    private readonly valueDate: string,
    private readonly bookedAt: Date,
    private readonly metadata: Record<string, string>,
  ) {}

  static for(input: {
    reference: string;
    type: EntryType;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): EntryBuilder {
    return new EntryBuilder(
      input.reference,
      input.type,
      input.description,
      input.valueDate,
      input.bookedAt,
      input.metadata ?? {},
    );
  }

  /** Debits a customer account: money leaving. Their deposit liability falls. */
  debitCustomer(accountId: string, amount: Money, narrative: string): this {
    this.postings.push(
      Posting.debit({
        ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
        accountId,
        amount,
        narrative,
      }),
    );
    return this;
  }

  /** Credits a customer account: money arriving. Their deposit liability rises. */
  creditCustomer(accountId: string, amount: Money, narrative: string): this {
    this.postings.push(
      Posting.credit({
        ledgerAccountCode: GL.CUSTOMER_DEPOSITS,
        accountId,
        amount,
        narrative,
      }),
    );
    return this;
  }

  debitLedger(code: string, amount: Money, narrative: string): this {
    this.postings.push(Posting.debit({ ledgerAccountCode: code, amount, narrative }));
    return this;
  }

  creditLedger(code: string, amount: Money, narrative: string): this {
    this.postings.push(Posting.credit({ ledgerAccountCode: code, amount, narrative }));
    return this;
  }

  add(posting: Posting): this {
    this.postings.push(posting);
    return this;
  }

  /**
   * Builds the entry, validating the balance invariant.
   * @throws {import('./ledger.errors.js').UnbalancedEntryError}
   */
  build(): JournalEntry {
    return JournalEntry.create({
      reference: this.reference,
      type: this.type,
      description: this.description,
      valueDate: this.valueDate,
      bookedAt: this.bookedAt,
      postings: this.postings,
      metadata: this.metadata,
    });
  }
}
