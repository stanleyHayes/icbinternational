import { PostingDirection, type LedgerAccountType } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { debitIncreases, findGlAccount } from './chart-of-accounts.js';
import { NonPositivePostingError, UnknownLedgerAccountError } from './ledger.errors.js';

/**
 * One side of a journal entry.
 *
 * A posting amount is always positive; the direction carries the sign. This is not a
 * stylistic choice — allowing negative debits means the same movement can be written two
 * ways, and a ledger you can express two ways is a ledger you can reconcile two ways.
 */
export class Posting {
  private constructor(
    /** GL account code from the chart of accounts. */
    readonly ledgerAccountCode: string,
    readonly ledgerAccountName: string,
    readonly ledgerAccountType: LedgerAccountType,
    /** Set when the posting also moves a customer-facing account balance. */
    readonly accountId: string | null,
    readonly direction: PostingDirection,
    readonly amount: Money,
    readonly narrative: string,
  ) {
    Object.freeze(this);
  }

  static create(input: {
    ledgerAccountCode: string;
    accountId?: string | null;
    direction: PostingDirection;
    amount: Money;
    narrative: string;
  }): Posting {
    const glAccount = findGlAccount(input.ledgerAccountCode);
    if (!glAccount) throw new UnknownLedgerAccountError(input.ledgerAccountCode);

    if (!input.amount.isPositive) throw new NonPositivePostingError(input.amount.amount);

    return new Posting(
      glAccount.code,
      glAccount.name,
      glAccount.type,
      input.accountId ?? null,
      input.direction,
      input.amount,
      input.narrative,
    );
  }

  static debit(input: Omit<Parameters<typeof Posting.create>[0], 'direction'>): Posting {
    return Posting.create({ ...input, direction: PostingDirection.DEBIT });
  }

  static credit(input: Omit<Parameters<typeof Posting.create>[0], 'direction'>): Posting {
    return Posting.create({ ...input, direction: PostingDirection.CREDIT });
  }

  get isDebit(): boolean {
    return this.direction === PostingDirection.DEBIT;
  }

  get isCredit(): boolean {
    return this.direction === PostingDirection.CREDIT;
  }

  get currency(): Money['currency'] {
    return this.amount.currency;
  }

  /**
   * Signed effect on the GL account's own balance, honouring its normal side.
   *
   * A debit to an asset increases it; a debit to a liability decreases it. Callers do not
   * reason about this — they ask the posting.
   */
  get effectOnLedgerAccount(): Money {
    const increases = debitIncreases(this.ledgerAccountType) === this.isDebit;
    return increases ? this.amount : this.amount.negate();
  }

  /**
   * Signed effect on the customer's balance.
   *
   * Customer accounts are liabilities of the bank: money the bank owes the customer. A
   * credit to `CUSTOMER_DEPOSITS` therefore increases what the customer sees, and a debit
   * decreases it — which is why a customer's "debit" feels backwards on a bank's books.
   */
  get effectOnCustomerBalance(): Money {
    return this.isCredit ? this.amount : this.amount.negate();
  }

  /** Mirrors this posting for a reversal entry. */
  reverse(narrative: string): Posting {
    return Posting.create({
      ledgerAccountCode: this.ledgerAccountCode,
      accountId: this.accountId,
      direction: this.isDebit ? PostingDirection.CREDIT : PostingDirection.DEBIT,
      amount: this.amount,
      narrative,
    });
  }

  toJSON() {
    return {
      ledgerAccountCode: this.ledgerAccountCode,
      ledgerAccountName: this.ledgerAccountName,
      accountId: this.accountId,
      direction: this.direction,
      amount: this.amount.toJSON(),
      narrative: this.narrative,
    };
  }
}
