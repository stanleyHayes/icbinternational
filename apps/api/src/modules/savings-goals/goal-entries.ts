/**
 * Moving money into and out of a savings vault.
 *
 * A vault holds the customer's own money, ring-fenced from what they can spend. On the
 * bank's books that is a liability like any deposit, and it has its own account —
 * `2400 Savings Vaults`, the dedicated one `docs/HANDOFFS.md` asked for. The property that
 * matters is that the money leaves `2000 Customer Deposits`, so the control total against
 * customer balances still reconciles exactly.
 *
 * Contributing is not an internal transfer. There is no second customer account to credit
 * — that is the whole point of a vault — so the customer leg is one-sided and the vault
 * liability is the counterparty.
 */

import { type Money } from '@reliance/money';

import { EntryBuilder, GL, type JournalEntry } from '../../domain/ledger/index.js';

/** Fields every entry in this file carries. */
interface EntryContext {
  readonly reference: string;
  readonly accountId: string;
  readonly amount: Money;
  readonly description: string;
  readonly valueDate: string;
  readonly bookedAt: Date;
  readonly metadata?: Record<string, string>;
}

const NARRATIVE = {
  INTO_VAULT: 'Moved into savings',
  OUT_OF_VAULT: 'Returned from savings',
} as const;

export const goalEntries = {
  /** Money leaves the current account and is ring-fenced in the vault. */
  contribution(input: EntryContext): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'GOAL_CONTRIBUTION' })
      .debitCustomer(input.accountId, input.amount, input.description)
      .creditLedger(GL.SAVINGS_VAULTS, input.amount, NARRATIVE.INTO_VAULT)
      .build();
  },

  /**
   * A round-up: the same movement, typed separately.
   *
   * Separate because a statement that showed forty pence as a "goal contribution" next to
   * the coffee that generated it would be read as a second charge. `ROUND_UP` lets the
   * statement group it with the purchase it came from.
   */
  roundUp(input: EntryContext): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'ROUND_UP' })
      .debitCustomer(input.accountId, input.amount, input.description)
      .creditLedger(GL.SAVINGS_VAULTS, input.amount, NARRATIVE.INTO_VAULT)
      .build();
  },

  /** Money comes out of the vault and back into the current account. */
  withdrawal(input: EntryContext): JournalEntry {
    return EntryBuilder.for({ ...input, type: 'GOAL_CONTRIBUTION' })
      .debitLedger(GL.SAVINGS_VAULTS, input.amount, NARRATIVE.OUT_OF_VAULT)
      .creditCustomer(input.accountId, input.amount, input.description)
      .build();
  },
};
