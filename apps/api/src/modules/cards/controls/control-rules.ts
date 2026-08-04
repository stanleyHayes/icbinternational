import { CardStatus, DeclineReason } from '@reliance/contracts';

import { type AuthorisationChannel } from '../authorisation/authorisation.store.js';
import { type CardRecord, type StoredCardControls } from '../card.store.js';

/**
 * The bank's own reasons for refusing a card payment, as pure functions.
 *
 * Nothing here reads a database, a clock it did not receive, or a config. Each rule takes
 * the card, the request and the moment, and returns a decline reason or nothing. That
 * makes the entire control surface exhaustively testable in milliseconds — which matters,
 * because every one of these rules is a promise the bank made to a customer about what
 * their card will and will not do, and a promise nobody can test is a promise nobody
 * should make.
 *
 * Order is deliberate. Status is checked before controls, and controls before limits,
 * because the answer the customer most needs is the earliest one: "your card is frozen"
 * is more useful than "you are over your daily limit" on a card they froze last week.
 */

/** Which controls are plain on/off switches, as opposed to ceilings or lists. */
type BooleanControl =
  | 'onlinePayments'
  | 'contactless'
  | 'atmWithdrawals'
  | 'internationalPayments'
  | 'magstripe';

/** What a rule needs to know about the payment being attempted. */
export interface ControlContext {
  readonly channel: AuthorisationChannel;
  readonly merchantId: string;
  readonly merchantCountry: string;
  readonly mcc: string;
  /** The bank's own country. Anything else is an international payment. */
  readonly homeCountry: string;
  readonly at: Date;
}

/** Whether the card itself is in a state that can authorise anything. */
export function statusDecline(card: CardRecord, at: Date): DeclineReason | null {
  if (card.expiresAt.getTime() < at.getTime() || card.status === CardStatus.EXPIRED) {
    return DeclineReason.CARD_EXPIRED;
  }

  return STATUS_DECLINES[card.status] ?? null;
}

/**
 * Which channel switches govern which channels.
 *
 * `CHIP` has no switch of its own on purpose: chip-and-PIN with the card physically
 * present is the baseline a debit card exists to provide, and a toggle that could turn it
 * off would leave a customer holding a card that does nothing at a till with no way to
 * know why. Freezing the card is the control for that, and it is honest about what it does.
 */
const CHANNEL_SWITCHES: Readonly<Partial<Record<AuthorisationChannel, BooleanControl>>> =
  Object.freeze({
    ONLINE: 'onlinePayments',
    RECURRING: 'onlinePayments',
    CONTACTLESS: 'contactless',
    ATM: 'atmWithdrawals',
    MAGSTRIPE: 'magstripe',
  });

/** Whether the channel this payment arrived over is switched on. */
export function channelDecline(
  controls: StoredCardControls,
  channel: AuthorisationChannel,
): DeclineReason | null {
  const switchName = CHANNEL_SWITCHES[channel];
  if (!switchName) return null;

  return controls[switchName] ? null : DeclineReason.CHANNEL_DISABLED;
}

/**
 * Whether the merchant's country is one this card may pay in.
 *
 * Two independent rules, and both have to pass. The international switch answers "may
 * this card leave the country at all"; the allow-list answers "and if so, where". An
 * **empty** allow-list means everywhere the international switch permits, not nowhere — a
 * customer who clears the list is loosening a restriction, and reading that as a total
 * block would strand them abroad for an action that looked permissive.
 */
export function countryDecline(
  controls: StoredCardControls,
  context: ControlContext,
): DeclineReason | null {
  const isDomestic = context.merchantCountry === context.homeCountry;
  if (!isDomestic && !controls.internationalPayments) return DeclineReason.COUNTRY_BLOCKED;

  const restricted = controls.allowedCountries.length > 0;
  if (restricted && !controls.allowedCountries.includes(context.merchantCountry)) {
    return DeclineReason.COUNTRY_BLOCKED;
  }

  return null;
}

/** Whether the merchant or its category is blocked on this card. */
export function merchantDecline(card: CardRecord, context: ControlContext): DeclineReason | null {
  if (card.controls.blockedMccs.includes(context.mcc)) return DeclineReason.MERCHANT_BLOCKED;

  const lockedElsewhere =
    card.lockedMerchantId !== null && card.lockedMerchantId !== context.merchantId;

  return lockedElsewhere ? DeclineReason.MERCHANT_BLOCKED : null;
}

/**
 * The first reason, if any, that the card's own settings refuse this payment.
 *
 * Composed here rather than at the call site so that the ordering — status, channel,
 * country, merchant — is a property of the rules and not of whoever wired them together.
 */
export function controlDecline(card: CardRecord, context: ControlContext): DeclineReason | null {
  return (
    statusDecline(card, context.at) ??
    channelDecline(card.controls, context.channel) ??
    countryDecline(card.controls, context) ??
    merchantDecline(card, context)
  );
}

/**
 * Statuses that refuse an authorisation outright, and what the terminal is told.
 *
 * A lost or stolen card answers `SUSPECTED_FRAUD` rather than naming its status. Telling
 * whoever is holding a stolen card that it has been reported is telling them to try the
 * next one in the wallet before the customer gets to it.
 */
const STATUS_DECLINES: Partial<Record<CardStatus, DeclineReason>> = Object.freeze({
  [CardStatus.ORDERED]: DeclineReason.CARD_NOT_ACTIVATED,
  [CardStatus.PRINTING]: DeclineReason.CARD_NOT_ACTIVATED,
  [CardStatus.SHIPPED]: DeclineReason.CARD_NOT_ACTIVATED,
  [CardStatus.DELIVERED]: DeclineReason.CARD_NOT_ACTIVATED,
  [CardStatus.INACTIVE]: DeclineReason.CARD_NOT_ACTIVATED,
  [CardStatus.FROZEN]: DeclineReason.CARD_FROZEN,
  [CardStatus.LOST]: DeclineReason.SUSPECTED_FRAUD,
  [CardStatus.STOLEN]: DeclineReason.SUSPECTED_FRAUD,
  [CardStatus.CANCELLED]: DeclineReason.CARD_FROZEN,
  [CardStatus.EXPIRED]: DeclineReason.CARD_EXPIRED,
});
