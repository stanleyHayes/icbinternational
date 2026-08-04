/**
 * Decline reasons in the words the customer was told, not the code the network sent.
 *
 * An agent reading `CHANNEL_DISABLED` to a customer says "channel disabled", the customer
 * hears nothing useful, and the call gets longer. Each reason here says what happened and
 * what fixes it, so the agent can resolve the call from the authorisation log rather than
 * escalating it.
 */

import { DeclineReason } from '@reliance/contracts';

/** How a decline is explained, and what to do about it. */
export interface DeclineExplanation {
  /** What happened, in one sentence an agent can read aloud. */
  readonly summary: string;
  /** What resolves it, for the agent. */
  readonly remedy: string;
  /** True when the bank refused for a control the customer themselves set. */
  readonly customerControlled: boolean;
}

const EXPLANATIONS: Readonly<Record<DeclineReason, DeclineExplanation>> = {
  [DeclineReason.INSUFFICIENT_FUNDS]: {
    summary: 'The available balance was too low to cover the payment.',
    remedy: 'Check for holds reducing the available balance before the customer tops up.',
    customerControlled: false,
  },
  [DeclineReason.CARD_FROZEN]: {
    summary: 'The card was frozen when the merchant asked for authorisation.',
    remedy: 'Unfreeze the card, then ask the customer to retry the payment.',
    customerControlled: true,
  },
  [DeclineReason.CARD_EXPIRED]: {
    summary: 'The card had passed its expiry date.',
    remedy: 'Issue a replacement card. Any subscriptions on it need the new details.',
    customerControlled: false,
  },
  [DeclineReason.CARD_NOT_ACTIVATED]: {
    summary: 'The card had been delivered but never activated.',
    remedy: 'Walk the customer through activation using the last four digits and a new PIN.',
    customerControlled: true,
  },
  [DeclineReason.CHANNEL_DISABLED]: {
    summary: 'The customer had switched off the channel the merchant used.',
    remedy: 'Check the card controls: online, contactless, cash machine and magnetic stripe.',
    customerControlled: true,
  },
  [DeclineReason.COUNTRY_BLOCKED]: {
    summary: 'The merchant was in a country the card is not allowed to be used in.',
    remedy: 'Add the country to the allowed list, or switch international payments on.',
    customerControlled: true,
  },
  [DeclineReason.MERCHANT_BLOCKED]: {
    summary: 'The merchant category is blocked on this card.',
    remedy: 'Review the blocked categories with the customer before removing one.',
    customerControlled: true,
  },
  [DeclineReason.LIMIT_EXCEEDED]: {
    summary: 'The payment would have taken the customer past a spending limit.',
    remedy: 'Check which limit — per payment, daily, monthly or cash machine — and when it resets.',
    customerControlled: true,
  },
  [DeclineReason.SUSPECTED_FRAUD]: {
    summary: 'Our fraud controls stopped the payment before it reached the account.',
    remedy:
      'Confirm the payment with the customer before releasing it. Raise a case if not theirs.',
    customerControlled: false,
  },
  [DeclineReason.INCORRECT_PIN]: {
    summary: 'The PIN entered did not match the one on the card.',
    remedy: 'The customer can set a new PIN in the app; three wrong attempts block the card.',
    customerControlled: false,
  },
  [DeclineReason.ISSUER_UNAVAILABLE]: {
    summary: 'We could not answer the network in time, so the payment was declined.',
    remedy: 'Check rail health for the card scheme. The customer should simply retry.',
    customerControlled: false,
  },
};

/** How this decline is explained to a customer. */
export function explainDecline(reason: DeclineReason): DeclineExplanation {
  return EXPLANATIONS[reason];
}

/** One-line summary for a table cell. */
export function declineSummary(reason: DeclineReason | null): string {
  return reason === null ? 'Approved' : EXPLANATIONS[reason].summary;
}
