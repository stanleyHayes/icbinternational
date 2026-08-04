/**
 * The journal entries a dispute books.
 *
 * Provisional credit is real money, moved through the one writer (`PostingService`) as a
 * balanced pair: the customer's deposit is credited against the suspense GL. There is no
 * dedicated chargeback-clearing account in the chart of accounts yet — `SUSPENSE` (2900)
 * is the closest existing fit and carries the chargeback receivable until the case ends.
 * A proposed `CHARGEBACKS_CLEARING` asset account is logged in `docs/HANDOFFS.md`.
 *
 * When the dispute is won the bank recovers from the card network, so the resolution
 * entry moves the parked amount from suspense to the card-network settlement account and
 * the customer's credit becomes permanent. When it is lost the provisional entry is
 * reversed whole by the ledger's `ReversalService` — never edited.
 */

import { EntryType } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { EntryBuilder, GL, type JournalEntry } from '../../../domain/ledger/index.js';
import { RESOLUTION_REFERENCE_PREFIX } from '../disputes.constants.js';

/** Everything the builders need that the dispute already knows. */
export interface DisputeEntryContext {
  readonly disputeId: string;
  readonly accountId: string;
  readonly description: string;
  readonly valueDate: string;
  readonly bookedAt: Date;
}

/**
 * The provisional credit: money back in the customer's account while the case runs.
 *
 * DEBIT `SUSPENSE` / CREDIT customer deposits. Reference is supplied by the caller so
 * the module's idempotency story (unique `reference`) applies at the ledger layer too.
 */
export function buildProvisionalCreditEntry(
  context: DisputeEntryContext,
  reference: string,
  amount: Money,
): JournalEntry {
  return EntryBuilder.for({
    reference,
    type: EntryType.DISPUTE_PROVISIONAL_CREDIT,
    description: `Provisional credit — ${context.description}`,
    valueDate: context.valueDate,
    bookedAt: context.bookedAt,
    metadata: { disputeId: context.disputeId },
  })
    .debitLedger(GL.SUSPENSE, amount, `Chargeback pending — ${context.description}`)
    .creditCustomer(context.accountId, amount, `Provisional credit — ${context.description}`)
    .build();
}

/**
 * Settlement of a won dispute that had a provisional credit.
 *
 * The scheme pays the chargeback back: DEBIT `CARD_NETWORK_SETTLEMENT` / CREDIT
 * `SUSPENSE`, clearing the receivable the provisional credit parked. The customer's
 * balance does not move — their credit simply stops being provisional.
 */
export function buildWonResolutionEntry(context: DisputeEntryContext, amount: Money): JournalEntry {
  return EntryBuilder.for({
    reference: `${RESOLUTION_REFERENCE_PREFIX}${context.disputeId}`,
    type: EntryType.DISPUTE_RESOLUTION,
    description: `Dispute won — ${context.description}`,
    valueDate: context.valueDate,
    bookedAt: context.bookedAt,
    metadata: { disputeId: context.disputeId },
  })
    .debitLedger(
      GL.CARD_NETWORK_SETTLEMENT,
      amount,
      `Chargeback recovered — ${context.description}`,
    )
    .creditLedger(GL.SUSPENSE, amount, `Chargeback cleared — ${context.description}`)
    .build();
}

/**
 * Settlement of a lost dispute where the bank leaves the credit in place as goodwill.
 *
 * The customer keeps the money, so the loss is the bank's: DEBIT `DISPUTE_LOSSES` /
 * CREDIT `SUSPENSE`, moving the parked receivable onto the expense line where a chargeback
 * the bank absorbed belongs.
 */
export function buildBankLossEntry(context: DisputeEntryContext, amount: Money): JournalEntry {
  return EntryBuilder.for({
    reference: `${RESOLUTION_REFERENCE_PREFIX}${context.disputeId}`,
    type: EntryType.DISPUTE_RESOLUTION,
    description: `Dispute lost, credit retained — ${context.description}`,
    valueDate: context.valueDate,
    bookedAt: context.bookedAt,
    metadata: { disputeId: context.disputeId },
  })
    .debitLedger(GL.DISPUTE_LOSSES, amount, `Chargeback absorbed — ${context.description}`)
    .creditLedger(GL.SUSPENSE, amount, `Chargeback cleared — ${context.description}`)
    .build();
}

/**
 * Settlement of a won dispute that had no provisional credit: the customer is paid now,
 * funded by the scheme's recovery rather than by suspense.
 */
export function buildWonPayoutEntry(context: DisputeEntryContext, amount: Money): JournalEntry {
  return EntryBuilder.for({
    reference: `${RESOLUTION_REFERENCE_PREFIX}${context.disputeId}`,
    type: EntryType.DISPUTE_RESOLUTION,
    description: `Dispute won — ${context.description}`,
    valueDate: context.valueDate,
    bookedAt: context.bookedAt,
    metadata: { disputeId: context.disputeId },
  })
    .debitLedger(
      GL.CARD_NETWORK_SETTLEMENT,
      amount,
      `Chargeback recovered — ${context.description}`,
    )
    .creditCustomer(context.accountId, amount, `Dispute refund — ${context.description}`)
    .build();
}
