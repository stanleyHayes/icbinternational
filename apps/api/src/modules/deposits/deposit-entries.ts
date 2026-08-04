/**
 * The one entry shape the deposits book needs and the shared catalogue does not name.
 *
 * Placement is already there (`depositPlacement`), and paying interest alone is
 * `interestCredit`. What is missing is the release: the moment a term ends and both the
 * principal and the interest come back to the customer in a single movement. Splitting it
 * into two entries would show a saver two credits on the same day with no explanation of
 * why one of them is their own money.
 *
 * `docs/HANDOFFS.md` proposes promoting this into `domain/ledger/recipes`.
 */

import { type Money } from '@reliance/money';

import { EntryBuilder, GL, type JournalEntry } from '../../domain/ledger/index.js';

const NARRATIVE = {
  PRINCIPAL: 'Deposit principal returned',
  INTEREST: 'Deposit interest',
} as const;

export const depositEntries = {
  /**
   * Releases a term deposit back to the customer's account.
   *
   * The principal moves from the term liability to the on-demand one — the bank owed it
   * either way, only the terms changed — while the interest is a genuine expense the bank
   * recognises for the first time. A zero-interest release, which a deposit broken on the
   * day it was placed produces, books the principal leg alone.
   */
  depositRelease(input: {
    reference: string;
    accountId: string;
    principal: Money;
    interest: Money;
    description: string;
    valueDate: string;
    bookedAt: Date;
    metadata?: Record<string, string>;
  }): JournalEntry {
    const builder = EntryBuilder.for({ ...input, type: 'DEPOSIT_MATURITY' })
      .debitLedger(GL.TERM_DEPOSITS, input.principal, NARRATIVE.PRINCIPAL)
      .creditCustomer(input.accountId, input.principal, input.description);

    if (input.interest.isPositive) {
      builder
        .debitLedger(GL.INTEREST_EXPENSE, input.interest, NARRATIVE.INTEREST)
        .creditCustomer(input.accountId, input.interest, NARRATIVE.INTEREST);
    }

    return builder.build();
  },
};
