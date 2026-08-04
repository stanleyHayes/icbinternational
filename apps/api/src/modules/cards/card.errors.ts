/**
 * The rejections the cards lane issues, written once.
 *
 * Every message here is what a customer reads. A card refusal is the most public thing a
 * bank does — it happens with somebody standing at a till — so the sentence has to say
 * what went wrong and what to do next, without naming a status enum or a handler.
 */

import { ErrorCode, type CardStatus, type DeclineReason } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { declineDescriptorFor } from '../../rails/card-network/index.js';

/** No such card, or one belonging to somebody else. The two are indistinguishable. */
export function cardNotFound(cardId: string): AppError {
  return new AppError({
    code: ErrorCode.CARD_NOT_FOUND,
    message: 'We could not find that card on your profile.',
    context: { cardId },
  });
}

/** The card is not in a state this operation can act on. */
export function cardStateConflict(input: {
  cardId: string;
  status: CardStatus;
  message: string;
}): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: input.message,
    context: { cardId: input.cardId, status: input.status },
  });
}

/**
 * The card moved while this request was in flight.
 *
 * Raised when a conditional write missed. It is a genuine conflict rather than a bug: a
 * customer can freeze a card from one device at the same moment they change its limits
 * from another, and the honest answer is to tell them to look again.
 */
export function cardChangedUnderneath(cardId: string): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: 'This card was updated a moment ago. Open it again to see where it stands.',
    context: { cardId },
  });
}

/**
 * An authorisation the issuer refused.
 *
 * The customer-facing sentence comes from the rail's decline table, so the wording a
 * cardholder sees in the app is the same wording behind the code the terminal printed.
 */
export function authorisationDeclined(input: {
  reason: DeclineReason;
  cardId: string;
  merchantName: string;
}): AppError {
  const descriptor = declineDescriptorFor(input.reason);

  return new AppError({
    code: ErrorCode.AUTHORISATION_DECLINED,
    message: descriptor.customerMessage,
    context: {
      cardId: input.cardId,
      merchantName: input.merchantName,
      reason: input.reason,
      responseCode: descriptor.responseCode,
    },
  });
}

/** The PIN did not match. Says nothing about how close it was. */
export function pinIncorrect(cardId: string, remainingAttempts: number): AppError {
  return new AppError({
    code: ErrorCode.PIN_INCORRECT,
    message: remainingAttemptsSentence(remainingAttempts),
    context: { cardId, remainingAttempts },
  });
}

/**
 * How many tries are left, told plainly.
 *
 * Counting down out loud is the kindest thing a card issuer can do here. A customer who
 * knows they have one attempt left will stop and reset rather than lock themselves out at
 * a checkout with a queue behind them.
 */
function remainingAttemptsSentence(remaining: number): string {
  if (remaining <= 0) return 'That PIN was not right and this card is now locked.';

  const tries = remaining === 1 ? 'try' : 'tries';
  return `That PIN was not right. You have ${remaining} more ${tries} before the card locks.`;
}

/** Too many wrong PINs. The card stops accepting one until the lockout lapses. */
export function pinLocked(cardId: string, until: Date): AppError {
  return new AppError({
    code: ErrorCode.PIN_TRIES_EXCEEDED,
    message:
      'This card is locked after too many incorrect PIN attempts. You can reset your PIN in the app to unlock it.',
    context: { cardId, until: until.toISOString() },
  });
}

/** The account already holds as many cards as the product allows. */
export function tooManyCards(accountId: string, limit: number): AppError {
  return new AppError({
    code: ErrorCode.LIMIT_EXCEEDED,
    message: `This account already has the maximum of ${limit} cards. Cancel one before ordering another.`,
    context: { accountId, limit },
  });
}

/** No such authorisation on this customer's cards. */
export function authorisationNotFound(authorisationId: string): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: 'We could not find that card payment.',
    context: { authorisationId },
  });
}

/** The authorisation has already been claimed, reversed or lapsed. */
export function authorisationNotOpen(input: {
  authorisationId: string;
  message: string;
}): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: input.message,
    context: { authorisationId: input.authorisationId },
  });
}
