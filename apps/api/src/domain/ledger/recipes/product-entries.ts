/**
 * Entry shapes for what the bank charges, pays and lends.
 *
 * Fees and interest are where a bank's income statement is actually written, so each of
 * these names the income or expense account explicitly rather than letting a caller pick.
 */
import { type Money } from '@reliance/money';

import { GL } from '../chart-of-accounts.js';
import { EntryBuilder } from '../entry-builder.js';
import { type JournalEntry } from '../journal-entry.js';

export const productEntries = {
  /** A fee. The customer's balance falls and the bank recognises income. */
  fee(input: {
    reference: string;
    accountId: string;
    amount: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'FEE' })
      .debitCustomer(input.accountId, input.amount, input.description)
      .creditLedger(GL.FEE_INCOME, input.amount, input.description)
      .build();
  },

  /** Interest paid to a saver: an expense to the bank, a credit to the customer. */
  interestCredit(input: {
    reference: string;
    accountId: string;
    amount: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'INTEREST_CREDIT' })
      .debitLedger(GL.INTEREST_EXPENSE, input.amount, input.description)
      .creditCustomer(input.accountId, input.amount, input.description)
      .build();
  },

  /** Interest charged on borrowing: income to the bank, a debit to the customer. */
  interestDebit(input: {
    reference: string;
    accountId: string;
    amount: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'INTEREST_DEBIT' })
      .debitCustomer(input.accountId, input.amount, input.description)
      .creditLedger(GL.INTEREST_INCOME, input.amount, input.description)
      .build();
  },

  /**
   * Cross-currency conversion between two of the customer's own wallets.
   *
   * Four postings that balance twice: the sell currency balances between the customer's
   * debit and the FX position, and the buy currency balances between the FX position and
   * the customer's credit. The spread is recognised as income in the buy currency.
   */
  fxConversion(input: {
    reference: string;
    fromAccountId: string;
    toAccountId: string;
    sellAmount: Money;
    buyAmount: Money;
    spread: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    const builder = EntryBuilder.for({ ...input, type: 'FX_CONVERSION' })
      .debitCustomer(input.fromAccountId, input.sellAmount, input.description)
      .creditLedger(GL.NOSTRO_CLEARING, input.sellAmount, `FX sell — ${input.description}`)
      .debitLedger(
        GL.NOSTRO_CLEARING,
        input.buyAmount.plus(input.spread),
        `FX buy — ${input.description}`,
      )
      .creditCustomer(input.toAccountId, input.buyAmount, input.description);

    if (input.spread.isPositive) {
      builder.creditLedger(GL.FX_SPREAD_INCOME, input.spread, 'FX spread');
    }

    return builder.build();
  },

  /** Card purchase settlement: the customer pays, the network is owed. */
  cardPurchase(input: {
    reference: string;
    accountId: string;
    amount: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'CARD_PURCHASE' })
      .debitCustomer(input.accountId, input.amount, input.description)
      .creditLedger(GL.CARD_NETWORK_SETTLEMENT, input.amount, input.description)
      .build();
  },

  /** Loan drawdown: an asset is created and the customer is funded. */
  loanDisbursement(input: {
    reference: string;
    accountId: string;
    amount: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'LOAN_DISBURSEMENT' })
      .debitLedger(GL.LOANS_RECEIVABLE, input.amount, input.description)
      .creditCustomer(input.accountId, input.amount, input.description)
      .build();
  },

  /** Loan repayment, split so principal and interest are separately visible. */
  loanRepayment(input: {
    reference: string;
    accountId: string;
    principal: Money;
    interest: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    const total = input.principal.plus(input.interest);
    const builder = EntryBuilder.for({ ...input, type: 'LOAN_REPAYMENT' }).debitCustomer(
      input.accountId,
      total,
      input.description,
    );

    if (input.principal.isPositive) {
      builder.creditLedger(GL.LOANS_RECEIVABLE, input.principal, 'Principal repayment');
    }
    if (input.interest.isPositive) {
      builder.creditLedger(GL.INTEREST_INCOME, input.interest, 'Interest');
    }

    return builder.build();
  },

  /** Term deposit placement: money moves from on-demand to term liability. */
  depositPlacement(input: {
    reference: string;
    accountId: string;
    amount: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'DEPOSIT_PLACEMENT' })
      .debitCustomer(input.accountId, input.amount, input.description)
      .creditLedger(GL.TERM_DEPOSITS, input.amount, input.description)
      .build();
  },
};
