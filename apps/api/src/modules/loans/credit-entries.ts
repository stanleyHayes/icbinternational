/**
 * Ledger entry shapes the lending book needs and the shared catalogue does not yet name.
 *
 * `domain/ledger/recipes` covers drawdown, repayment split by principal and interest, and
 * fees taken straight from an account. Lending also has to recognise a fee it has *not*
 * collected, hold an allowance against a loan that is going bad, and write one off against
 * that allowance — none of which move a customer balance at all.
 *
 * They live here rather than as loose `Posting`s in a service so the module still has a
 * finite, named vocabulary of movements. `docs/HANDOFFS.md` proposes promoting them into
 * the shared catalogue, along with a dedicated `2400 Loan Loss Allowance` account; until
 * that exists the allowance is carried in `2900 Suspense`, which nets back to nil as each
 * provision is either released on cure or consumed by a write-off.
 */

import { type Money } from '@reliance/money';

import { EntryBuilder, GL, type JournalEntry } from '../../domain/ledger/index.js';

/** Fields every entry in this file carries. */
interface EntryContext {
  readonly reference: string;
  readonly description: string;
  readonly valueDate: string;
  readonly bookedAt: Date;
  readonly metadata?: Record<string, string>;
}

const NARRATIVE = {
  PRINCIPAL: 'Principal repayment',
  INTEREST: 'Interest',
  FEES: 'Fees recovered',
  LATE_FEE: 'Late payment fee',
  ALLOWANCE: 'Loan loss allowance',
  ALLOWANCE_RELEASE: 'Loan loss allowance utilised',
  WRITE_OFF: 'Balance written off',
} as const;

export const creditEntries = {
  /**
   * A repayment split three ways in a single entry.
   *
   * One entry rather than three because the customer made one payment: a statement that
   * showed a repayment as three separate debits on the same day would be read as three
   * payments. Zero-value legs are omitted so the entry never carries a posting for nothing.
   */
  loanRepayment(
    input: EntryContext & {
      accountId: string;
      principal: Money;
      interest: Money;
      fees: Money;
    },
  ): JournalEntry {
    const total = input.principal.plus(input.interest).plus(input.fees);
    const builder = EntryBuilder.for({ ...input, type: 'LOAN_REPAYMENT' }).debitCustomer(
      input.accountId,
      total,
      input.description,
    );

    if (input.fees.isPositive) {
      builder.creditLedger(GL.FEES_RECEIVABLE, input.fees, NARRATIVE.FEES);
    }
    if (input.interest.isPositive) {
      builder.creditLedger(GL.INTEREST_INCOME, input.interest, NARRATIVE.INTEREST);
    }
    if (input.principal.isPositive) {
      builder.creditLedger(GL.LOANS_RECEIVABLE, input.principal, NARRATIVE.PRINCIPAL);
    }

    return builder.build();
  },

  /**
   * A late fee charged to the loan rather than collected from an account.
   *
   * The customer who has just missed an instalment is, by definition, the customer whose
   * account is empty. Debiting them would overdraw the account and manufacture a second
   * problem, so the fee is recognised as a receivable and collected from the next payment
   * — which is also why the repayment entry above credits `1300` and not fee income.
   */
  lateFee(input: EntryContext & { amount: Money }): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'FEE' })
      .debitLedger(GL.FEES_RECEIVABLE, input.amount, NARRATIVE.LATE_FEE)
      .creditLedger(GL.FEE_INCOME, input.amount, NARRATIVE.LATE_FEE)
      .build();
  },

  /**
   * Recognising, or releasing, loss allowance as a loan moves between arrears buckets.
   *
   * `amount` is the *change* in the allowance, and the direction follows its sign: a loan
   * sliding from 30 to 60 days past due books more expense, a loan that cures releases it
   * back. Booking the movement rather than the level is what keeps the expense account a
   * period figure instead of a running total.
   */
  loanLossAllowance(input: EntryContext & { increase: Money }): JournalEntry {
    const builder = EntryBuilder.for({ ...input, type: 'MANUAL_ADJUSTMENT' });
    const magnitude = input.increase.abs();

    return input.increase.isPositive
      ? builder
          .debitLedger(GL.LOAN_LOSS_PROVISION, magnitude, NARRATIVE.ALLOWANCE)
          .creditLedger(GL.LOAN_LOSS_ALLOWANCE, magnitude, NARRATIVE.ALLOWANCE)
          .build()
      : builder
          .debitLedger(GL.LOAN_LOSS_ALLOWANCE, magnitude, NARRATIVE.ALLOWANCE_RELEASE)
          .creditLedger(GL.LOAN_LOSS_PROVISION, magnitude, NARRATIVE.ALLOWANCE_RELEASE)
          .build();
  },

  /**
   * Writing the balance off: the receivable goes, the allowance is consumed.
   *
   * Anything the allowance does not cover falls straight to expense in the period of the
   * write-off. That shortfall is the cost of having under-provisioned, and showing it
   * separately from the allowance release is what makes that visible in the accounts.
   */
  loanWriteOff(input: EntryContext & { outstanding: Money; allowanceHeld: Money }): JournalEntry {
    const release = input.allowanceHeld.lessThan(input.outstanding)
      ? input.allowanceHeld
      : input.outstanding;
    const shortfall = input.outstanding.minus(release);

    const builder = EntryBuilder.for({ ...input, type: 'WRITE_OFF' });
    if (release.isPositive) {
      builder.debitLedger(GL.LOAN_LOSS_ALLOWANCE, release, NARRATIVE.ALLOWANCE_RELEASE);
    }
    if (shortfall.isPositive) {
      builder.debitLedger(GL.LOAN_LOSS_PROVISION, shortfall, NARRATIVE.WRITE_OFF);
    }

    return builder
      .creditLedger(GL.LOANS_RECEIVABLE, input.outstanding, NARRATIVE.WRITE_OFF)
      .build();
  },
};
