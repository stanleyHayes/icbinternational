/**
 * Fluent builder for the contract `JournalEntry` — balanced by construction.
 *
 * The default is a simple two-leg deposit: £100.00 out of `1000 Cash at Central
 * Bank`, into `2000 Customer Deposits`. Adding a leg mirrors it automatically, so a
 * built entry always passes `toBalance()` — to test the failure path, tamper with a
 * built entry rather than expecting the builder to produce an invalid one.
 */

import {
  EntryType,
  JournalEntryStatus,
  PostingDirection,
  journalEntrySchema,
  type JournalEntry,
  type Posting,
} from '@reliance/contracts';

import { Builder, DEFAULT_DATE, DEFAULT_INSTANT } from './builder.js';
import { aMoney, type MinorUnitsInput } from './money.builder.js';
import { testId } from './test-id.js';

/** Default deposit legs — see `chart_of_accounts` in agent_plan.md §3.2. */
const DEFAULT_DEBIT_ACCOUNT = { code: '1000', name: 'Cash at Central Bank' };
const DEFAULT_CREDIT_ACCOUNT = { code: '2000', name: 'Customer Deposits' };
const DEFAULT_AMOUNT_MINOR = 10_000n;
const DEFAULT_NARRATIVE = 'Test posting';
/** How many ULID characters the default reference keeps. */
const REFERENCE_SUFFIX_LENGTH = 12;

interface LedgerSide {
  readonly code: string;
  readonly name: string;
}

/** Builds contract-valid, balanced {@link JournalEntry} objects. */
export class JournalEntryBuilder extends Builder<JournalEntry> {
  private idOverride: string | null = null;
  private referenceOverride: string | null = null;
  private status: JournalEntryStatus = JournalEntryStatus.POSTED;
  private amountMinor: bigint = DEFAULT_AMOUNT_MINOR;
  private debitSide: LedgerSide = DEFAULT_DEBIT_ACCOUNT;
  private creditSide: LedgerSide = DEFAULT_CREDIT_ACCOUNT;
  private accountId: string | null = testId('acc');

  withId(id: string): this {
    this.idOverride = id;
    return this;
  }

  withReference(reference: string): this {
    this.referenceOverride = reference;
    return this;
  }

  withStatus(status: JournalEntryStatus): this {
    this.status = status;
    return this;
  }

  /** Sets the amount moved by every leg of the entry. */
  withAmount(amount: MinorUnitsInput): this {
    this.amountMinor = BigInt(aMoney().withMinor(amount).buildJSON().amount);
    return this;
  }

  /** Sets the customer account the credit leg hits; `null` for a pure GL entry. */
  withAccountId(accountId: string | null): this {
    this.accountId = accountId;
    return this;
  }

  /** Replaces the debit-side GL account. */
  withDebitAccount(code: string, name: string): this {
    this.debitSide = { code, name };
    return this;
  }

  /** Replaces the credit-side GL account. */
  withCreditAccount(code: string, name: string): this {
    this.creditSide = { code, name };
    return this;
  }

  build(): JournalEntry {
    const id = this.idOverride ?? testId('jnl');
    return journalEntrySchema.parse({
      id,
      reference: this.referenceOverride ?? `TEST-${id.slice(-REFERENCE_SUFFIX_LENGTH)}`,
      type: EntryType.INTERNAL_TRANSFER,
      status: this.status,
      description: 'Test journal entry',
      valueDate: DEFAULT_DATE,
      bookedAt: DEFAULT_INSTANT,
      postings: [this.debitLeg(), this.creditLeg()],
      reversesEntryId: null,
      reversedByEntryId: null,
      metadata: { origin: '@reliance/testing' },
    });
  }

  private debitLeg(): Posting {
    return {
      ledgerAccountCode: this.debitSide.code,
      ledgerAccountName: this.debitSide.name,
      accountId: null,
      direction: PostingDirection.DEBIT,
      amount: aMoney().withMinor(this.amountMinor).buildJSON(),
      narrative: DEFAULT_NARRATIVE,
    };
  }

  private creditLeg(): Posting {
    return {
      ledgerAccountCode: this.creditSide.code,
      ledgerAccountName: this.creditSide.name,
      accountId: this.accountId,
      direction: PostingDirection.CREDIT,
      amount: aMoney().withMinor(this.amountMinor).buildJSON(),
      narrative: DEFAULT_NARRATIVE,
    };
  }
}

/** Entry point: `aJournalEntry().withAmount(50_000n).build()`. */
export function aJournalEntry(): JournalEntryBuilder {
  return new JournalEntryBuilder();
}
