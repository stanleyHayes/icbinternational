import { type Money } from '@reliance/money';

import { EntryBuilder, GL, type JournalEntry } from '../../domain/ledger/index.js';

/**
 * The one entry shape bill payment needs that the ledger's catalogue does not yet carry.
 *
 * Everything else this lane books comes from `entries`: the debit is
 * `entries.outboundTransfer`, the settlement is `entries.settleOutbound`, the fee is
 * `entries.fee`. Only the return leg has no recipe — the money is sitting in
 * `UNSETTLED_OUTBOUND` because the payment left the customer but never reached the biller,
 * and putting it back is a movement the catalogue has not had to describe before.
 *
 * It is written here rather than invented inline in the processor so there is still exactly
 * one definition of it, and `docs/HANDOFFS.md` carries the request to promote it into
 * `movementEntries` where it belongs. The ledger's vocabulary is meant to be finite and
 * reviewable, and a shape living in a feature module is a temporary state, not a pattern.
 */

/**
 * Money the biller would not take, returned to the customer in full.
 *
 * The mirror of the `outboundTransfer` debit: the in-flight liability is discharged and the
 * customer's deposit is restored, penny for penny. No fee is unwound because none was
 * charged — the fee is booked on completion, and this payment did not complete.
 */
export function billPaymentReversal(input: {
  reference: string;
  accountId: string;
  amount: Money;
  description: string;
  valueDate: string;
  bookedAt: Date;
  metadata?: Record<string, string>;
}): JournalEntry {
  return EntryBuilder.for({ ...input, type: 'REVERSAL' })
    .debitLedger(GL.UNSETTLED_OUTBOUND, input.amount, 'Payment returned by the biller')
    .creditCustomer(input.accountId, input.amount, input.description)
    .build();
}
