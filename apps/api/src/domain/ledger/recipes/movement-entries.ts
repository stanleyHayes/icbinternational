/**
 * Entry shapes for money moving into, out of and within the bank.
 *
 * Each returns a complete, balanced entry. New kinds of movement get a recipe here rather
 * than ad-hoc postings in a service — that is what keeps the ledger's vocabulary finite,
 * reviewable and auditable.
 */
import { type EntryType } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { GL } from '../chart-of-accounts.js';
import { EntryBuilder } from '../entry-builder.js';
import { type JournalEntry } from '../journal-entry.js';

export const movementEntries = {
  /**
   * Customer to customer, inside the bank.
   *
   * Both legs hit `CUSTOMER_DEPOSITS`: the bank's total liability to its customers is
   * unchanged, only its distribution between two of them. No money enters or leaves.
   */
  internalTransfer(input: {
    reference: string;
    fromAccountId: string;
    toAccountId: string;
    amount: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'INTERNAL_TRANSFER' })
      .debitCustomer(input.fromAccountId, input.amount, input.description)
      .creditCustomer(input.toAccountId, input.amount, input.description)
      .build();
  },

  /**
   * Money leaving the bank over an external rail.
   *
   * The customer is debited immediately; the credit sits in `UNSETTLED_OUTBOUND` until
   * the rail confirms settlement, at which point a second entry moves it to the nostro.
   * Modelling the in-flight state explicitly is what makes returns reversible.
   */
  outboundTransfer(input: {
    reference: string;
    fromAccountId: string;
    amount: Money;
    fee: Money;
    type: EntryType;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    const builder = EntryBuilder.for(input)
      .debitCustomer(input.fromAccountId, input.amount, input.description)
      .creditLedger(GL.UNSETTLED_OUTBOUND, input.amount, `In flight — ${input.description}`);

    if (input.fee.isPositive) {
      builder
        .debitCustomer(input.fromAccountId, input.fee, 'Transfer fee')
        .creditLedger(GL.FEE_INCOME, input.fee, 'Transfer fee');
    }

    return builder.build();
  },

  /** Settlement of an in-flight outbound payment: liability becomes a cash outflow. */
  settleOutbound(input: {
    reference: string;
    amount: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'DOMESTIC_TRANSFER' })
      .debitLedger(GL.UNSETTLED_OUTBOUND, input.amount, 'Settled')
      .creditLedger(GL.NOSTRO_CLEARING, input.amount, input.description)
      .build();
  },

  /** Money arriving from outside. The nostro grows; so does what the bank owes. */
  inboundTransfer(input: {
    reference: string;
    toAccountId: string;
    amount: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'INBOUND_TRANSFER' })
      .debitLedger(GL.NOSTRO_CLEARING, input.amount, input.description)
      .creditCustomer(input.toAccountId, input.amount, input.description)
      .build();
  },

  /**
   * Funding the bank from outside for simulation purposes.
   *
   * Even simulated money must come from somewhere. Crediting a customer without a
   * matching debit would break the trial balance and quietly void the double-entry
   * guarantee, so simulated inbound value is drawn from the nostro like real value is.
   */
  simulatedFunding(input: {
    reference: string;
    accountId: string;
    amount: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
  }): JournalEntry {
    return EntryBuilder.for({
      ...input,
      type: 'INBOUND_TRANSFER',
      metadata: { fundingSource: 'treasury' },
    })
      .debitLedger(GL.NOSTRO_CLEARING, input.amount, input.description)
      .creditCustomer(input.accountId, input.amount, input.description)
      .build();
  },
};
