import { ErrorCode, PostingDirection } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { AppError } from '../../../common/errors/app-error.js';
import { fromStored } from '../../../common/money/money.codec.js';
import { type PostingRecord } from '../../ledger/repositories/journal-entry.store.js';

/** One customer account's net movement from a single journal entry. */
export interface CustomerEffect {
  readonly accountId: string;
  /** Signed as the customer experiences it: positive is money in. */
  readonly net: Money;
}

/**
 * Collapses an entry's legs into one movement per customer account.
 *
 * An entry frequently touches the same account twice — a transfer that also charges a fee
 * debits the customer for the amount and again for the fee. A customer expects one line
 * on their statement for that, not two, and the ledger has already decided the two legs
 * belong to one event by putting them in one entry.
 *
 * Sign convention comes from the ledger: customer accounts are liabilities of the bank,
 * so a *credit* increases what the customer sees and a *debit* decreases it. This mirrors
 * `Posting.effectOnCustomerBalance` exactly, and must continue to — the running balance
 * this produces is diffed against the account's stored balance by the projector's tests.
 */
export function customerEffects(postings: readonly PostingRecord[]): CustomerEffect[] {
  const totals = new Map<string, CustomerEffect>();

  for (const posting of postings) {
    if (posting.accountId === null) continue;

    const signed = signedEffect(posting);
    const running = totals.get(posting.accountId);

    totals.set(posting.accountId, {
      accountId: posting.accountId,
      net: running ? addOrReject(running, signed) : signed,
    });
  }

  return [...totals.values()];
}

function signedEffect(posting: PostingRecord): Money {
  const amount = fromStored(posting.amount);
  return posting.direction === PostingDirection.CREDIT ? amount : amount.negate();
}

/**
 * Sums two legs on the same account, refusing a mixed-currency entry.
 *
 * The projection stores one row per `(journalEntryId, accountId)` and that pair is a
 * unique index, so there is nowhere to put a second currency for the same account. Rather
 * than silently drop a leg or let `Money.plus` throw a currency error from three frames
 * deep, this rejects it in the caller's vocabulary. Reaching it means an entry posted two
 * currencies to one account, which no account in this bank can hold.
 */
function addOrReject(running: CustomerEffect, next: Money): Money {
  if (running.net.currency !== next.currency) {
    throw new AppError({
      code: ErrorCode.CURRENCY_MISMATCH,
      message:
        `Account ${running.accountId} received both ${running.net.currency} and ` +
        `${next.currency} in one journal entry. A transaction row cannot represent that.`,
      context: { accountId: running.accountId },
    });
  }
  return running.net.plus(next);
}
