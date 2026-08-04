import { DeclineReason } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { type CardRecord } from '../card.store.js';
import { controlDecline, type ControlContext } from '../controls/control-rules.js';
import { headroom, limitDecline, type SpendWindows } from '../controls/spend-limits.js';

/**
 * What the issuer decides about one authorisation, before any money moves.
 *
 * A pure function of the card, the request and the windows it is measured against.
 * Everything with a side effect — placing the hold, writing the record, answering the
 * terminal — happens outside, which is what lets every branch of this decision be proven
 * with a fixture rather than a database.
 */

/** The answer, and the amount it is an answer for. */
export interface AuthorisationDecision {
  readonly approved: boolean;
  /** What may be taken. Equal to the request unless this is a partial approval. */
  readonly amount: Money;
  readonly declineReason: DeclineReason | null;
  /** True when the merchant asked for more than the issuer would approve. */
  readonly partial: boolean;
}

/** Everything the decision reads. */
export interface DecisionInput {
  readonly card: CardRecord;
  readonly amount: Money;
  /** Funds genuinely available on the account, holds already deducted. */
  readonly available: Money;
  readonly windows: SpendWindows;
  readonly context: ControlContext;
  /** Whether the merchant will accept an approval for less than they asked for. */
  readonly partialApprovalAllowed: boolean;
  /** Set when the terminal captured a PIN and the issuer has already checked it. */
  readonly pinVerified?: boolean;
  /** Set when the channel demanded a PIN and none was presented or it was wrong. */
  readonly pinFailed?: boolean;
}

/**
 * The issuer's answer.
 *
 * The order of the checks is the order the customer would want to be told about them.
 * Card state first — "your card is frozen" is the answer that makes every other one
 * irrelevant. Then the controls they set themselves. Then the PIN, because a wrong PIN on
 * a card that was going to be declined anyway should not burn one of three attempts.
 * Money last, because it is the only check that can be answered with a smaller approval
 * instead of a refusal.
 */
export function decide(input: DecisionInput): AuthorisationDecision {
  const controlRefusal = controlDecline(input.card, input.context);
  if (controlRefusal) return declined(input.amount, controlRefusal);

  if (input.pinFailed) return declined(input.amount, DeclineReason.INCORRECT_PIN);

  const isCashWithdrawal = input.context.channel === 'ATM';
  const limitRefusal = limitDecline({
    controls: input.card.controls,
    amount: input.amount,
    windows: input.windows,
    isCashWithdrawal,
  });

  if (limitRefusal) return resolveShortfall(input, limitRefusal, isCashWithdrawal);
  if (input.available.lessThan(input.amount)) {
    return resolveShortfall(input, DeclineReason.INSUFFICIENT_FUNDS, isCashWithdrawal);
  }

  return { approved: true, amount: input.amount, declineReason: null, partial: false };
}

/**
 * Turns a shortfall into a partial approval where the merchant allows one.
 *
 * A fuel pump, a transit gate and a top-up terminal all prefer taking what is there to
 * taking nothing. Where the merchant has not said they accept less, the honest answer is
 * a decline: approving £8 of a £40 basket a merchant cannot part-fulfil leaves the
 * customer paid-out and empty-handed.
 */
function resolveShortfall(
  input: DecisionInput,
  reason: DeclineReason,
  isCashWithdrawal: boolean,
): AuthorisationDecision {
  if (!input.partialApprovalAllowed) return declined(input.amount, reason);

  const ceiling = headroom({
    controls: input.card.controls,
    windows: input.windows,
    currency: input.amount.currency,
    isCashWithdrawal,
  });

  const offer = lowestOf(input.available, ceiling);
  if (!offer.isPositive) return declined(input.amount, reason);

  return { approved: true, amount: offer, declineReason: null, partial: true };
}

/** The tighter of the funds available and whatever ceiling still has room. */
function lowestOf(available: Money, ceiling: Money | null): Money {
  if (!ceiling) return available;
  return ceiling.lessThan(available) ? ceiling : available;
}

/** A refusal, for the reason given. Exported so a caller that short-circuits can build one. */
export function declined(amount: Money, reason: DeclineReason): AuthorisationDecision {
  return { approved: false, amount, declineReason: reason, partial: false };
}
