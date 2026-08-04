import { type Money } from '@reliance/money';

import { EntryBuilder, GL, type JournalEntry } from '../../../domain/ledger/index.js';

/**
 * The journal entry a card refund books.
 *
 * A refund is not a reversal. The original purchase happened, appears on the statement,
 * and stays there; the merchant is separately giving money back, days or weeks later,
 * often for part of the basket. Mirroring the original entry would erase a movement that
 * genuinely occurred and would be unable to express a partial return at all.
 *
 * So it is its own entry, in the opposite direction: the scheme's settlement position is
 * debited and the customer is credited.
 *
 * **This builder is temporary.** New movement shapes belong in
 * `domain/ledger/recipes/product-entries.ts` as `productEntries.cardRefund`, beside
 * `cardPurchase`, so the ledger's vocabulary stays finite and reviewable in one file. The
 * cards lane does not own that directory; a handoff asks for the recipe, and this file is
 * deleted the moment it lands.
 */
export function cardRefundEntry(input: {
  reference: string;
  accountId: string;
  amount: Money;
  description: string;
  valueDate: string;
  bookedAt: Date;
  metadata?: Record<string, string>;
}): JournalEntry {
  return EntryBuilder.for({ ...input, type: 'CARD_REFUND' })
    .debitLedger(GL.CARD_NETWORK_SETTLEMENT, input.amount, input.description)
    .creditCustomer(input.accountId, input.amount, input.description)
    .build();
}
