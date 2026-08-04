/**
 * Decline reasons as the scheme states them, and as the customer reads them.
 *
 * Two audiences, two vocabularies, one table. The acquirer gets an ISO 8583 field-39
 * response code, because that is the only thing a terminal understands. The customer gets
 * a sentence that says what happened and what to do about it — "your card is frozen" is
 * actionable, "62" is not.
 *
 * Keeping both in one place is what stops the two drifting: a new decline reason cannot
 * be added with a code and no sentence, because the record type will not compile.
 */

import { DeclineReason } from '@reliance/contracts';

/** ISO 8583 field 39 value for an approval. */
export const APPROVAL_RESPONSE_CODE = '00';

/** What the rail returns alongside a decision. */
export interface DeclineDescriptor {
  /** ISO 8583 field 39 response code sent back to the acquirer. */
  readonly responseCode: string;
  /** What the customer is told, in the bank's own voice. */
  readonly customerMessage: string;
  /**
   * Whether the merchant may retry the same authorisation unchanged.
   *
   * A switch outage is worth retrying; a frozen card is not, and a terminal that retries
   * it will only lock the customer out of a card they deliberately froze.
   */
  readonly retryable: boolean;
}

/**
 * Every decline the issuer can return.
 *
 * The codes are the conventional ones so that a terminal, an acquirer log and this table
 * all agree on what happened. Where the standard offers several defensible codes the more
 * specific one is chosen, because "transaction not permitted" tells a merchant nothing
 * they can pass on to the person standing in front of them.
 */
export const DECLINE_DESCRIPTORS: Readonly<Record<DeclineReason, DeclineDescriptor>> =
  Object.freeze({
    [DeclineReason.INSUFFICIENT_FUNDS]: descriptor(
      '51',
      'There was not enough available balance to cover this payment.',
      true,
    ),
    [DeclineReason.CARD_FROZEN]: descriptor(
      '62',
      'This card is frozen. Unfreeze it in the app and try the payment again.',
      false,
    ),
    [DeclineReason.CARD_EXPIRED]: descriptor(
      '54',
      'This card has expired. Your replacement card will work as soon as you activate it.',
      false,
    ),
    [DeclineReason.CARD_NOT_ACTIVATED]: descriptor(
      '78',
      'This card has not been activated yet. Activate it in the app before you use it.',
      false,
    ),
    [DeclineReason.CHANNEL_DISABLED]: descriptor(
      '57',
      'This way of paying is switched off for this card. You can turn it back on in your card controls.',
      false,
    ),
    [DeclineReason.COUNTRY_BLOCKED]: descriptor(
      '58',
      'This card is not set up to pay in the country the merchant is in.',
      false,
    ),
    [DeclineReason.MERCHANT_BLOCKED]: descriptor(
      '63',
      'This merchant is blocked on this card.',
      false,
    ),
    [DeclineReason.LIMIT_EXCEEDED]: descriptor(
      '61',
      'This payment is above the spending limit set on this card.',
      false,
    ),
    [DeclineReason.SUSPECTED_FRAUD]: descriptor(
      '59',
      'We stopped this payment because it did not look like you. Confirm it in the app and try again.',
      false,
    ),
    [DeclineReason.INCORRECT_PIN]: descriptor(
      '55',
      'That PIN was not right. Try again, or reset your PIN in the app.',
      true,
    ),
    [DeclineReason.ISSUER_UNAVAILABLE]: descriptor(
      '91',
      'We could not reach our card systems just now. Please try the payment again in a moment.',
      true,
    ),
  });

/** The scheme code and customer sentence for a decline. */
export function declineDescriptorFor(reason: DeclineReason): DeclineDescriptor {
  return DECLINE_DESCRIPTORS[reason];
}

/** The ISO 8583 response code for a decline, or `00` when there is none. */
export function responseCodeFor(reason: DeclineReason | null): string {
  return reason ? DECLINE_DESCRIPTORS[reason].responseCode : APPROVAL_RESPONSE_CODE;
}

function descriptor(
  responseCode: string,
  customerMessage: string,
  retryable: boolean,
): DeclineDescriptor {
  return Object.freeze({ responseCode, customerMessage, retryable });
}
