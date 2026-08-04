/**
 * Scheme parameters the card rail runs on.
 *
 * These are the numbers a real issuer negotiates with a scheme and then treats as fixed:
 * BIN ranges, how long an authorisation may sit unclaimed, the interchange it pays, and
 * the strong-customer-authentication thresholds. Naming them here means a change to
 * scheme rules is a one-line edit rather than a hunt through the authorisation path.
 */

import { type CardAuthorisation, type CardScheme } from '@reliance/contracts';

/** The channel an authorisation arrived over, as the contract spells it. */
export type CardChannel = CardAuthorisation['channel'];

/** A bank identification number: the leading digits that route a PAN to its issuer. */
export interface BinRange {
  readonly scheme: CardScheme;
  /** Leading digits of every PAN issued under this range. */
  readonly prefix: string;
  /** Human name for reconciliation reports and BIN-file exports. */
  readonly label: string;
}

/**
 * Reliance Bank's issuing BINs.
 *
 * One per scheme, both debit. The first digit is the scheme's major industry identifier —
 * `4` is Visa, `5` is Mastercard — and a PAN that starts with anything else would be
 * routed away from us by the first switch that saw it.
 */
export const CARD_BINS: readonly BinRange[] = Object.freeze([
  Object.freeze({ scheme: 'VISA', prefix: '453919', label: 'Reliance Visa Debit' }),
  Object.freeze({ scheme: 'MASTERCARD', prefix: '533102', label: 'Reliance Mastercard Debit' }),
]);

/** Digits in a PAN, including the BIN and the Luhn check digit. */
export const PAN_LENGTH = 16;

/** Digits in the card verification value printed on the signature strip. */
export const CVV_LENGTH = 3;

/** How many trailing digits of the PAN a customer is ever shown. */
export const LAST4_LENGTH = 4;

/** Years a newly issued card is valid for before it must be replaced. */
export const CARD_VALIDITY_YEARS = 3;

/**
 * How long an approved authorisation holds funds before it lapses, by channel.
 *
 * Scheme rules differ by how likely the merchant is to present late. A hotel or a fuel
 * pump clears days after the customer walks away; an ATM has already dispensed the cash
 * and clears the same day. Holding a customer's money for a week on a cash withdrawal
 * that settled at once is money they cannot spend for no reason.
 */
export const AUTHORISATION_VALIDITY_HOURS: Readonly<Record<CardChannel, number>> = Object.freeze({
  ONLINE: 168,
  CONTACTLESS: 120,
  CHIP: 168,
  MAGSTRIPE: 168,
  ATM: 24,
  RECURRING: 168,
});

/** Denominator for every rate expressed in basis points. */
export const BASIS_POINTS_TOTAL = 10_000;

/**
 * Interchange the acquirer pays the issuer, in basis points of the cleared amount.
 *
 * Twenty basis points is the regulated cap on a consumer debit transaction. It is
 * recognised at settlement rather than at capture, because until the batch closes the
 * scheme has not told us which items it accepted.
 */
export const INTERCHANGE_BPS = 20;

/**
 * Contactless and low-value online payments below this are exempt from a 3DS challenge.
 *
 * Minor units of the card's own currency. The exemption is what stops a £2.40 coffee
 * throwing up a banking-app prompt, and it is the reason the threshold lives here rather
 * than being inlined in the decision.
 */
export const LOW_VALUE_EXEMPTION_MINOR = 10_000n;

/**
 * How often an exempt online payment is still challenged, in basis points.
 *
 * Schemes require issuers to challenge a sample of otherwise-exempt traffic so that
 * fraud rates stay measurable. It is deterministic from the seed, so a replayed scenario
 * challenges exactly the same payments.
 */
export const THREE_DS_SAMPLING_BPS = 500;

/** Characters in the scheme's own reference for a message. */
export const NETWORK_REFERENCE_LENGTH = 12;

/** Prefix on a settlement batch identifier, so it is legible in a reconciliation file. */
export const SETTLEMENT_BATCH_PREFIX = 'BATCH';

/** Prefix on the scheme's acquirer reference number. */
export const NETWORK_REFERENCE_PREFIX = 'ARN';

/** Prefix on the clearing presentment reference. */
export const CLEARING_REFERENCE_PREFIX = 'CLR';

/** Alphabet the rail mints references from: digits only, as the scheme files require. */
export const REFERENCE_ALPHABET = '0123456789';

/** How many increments one authorisation may take before the merchant must re-authorise. */
export const MAX_INCREMENTAL_AUTHORISATIONS = 5;
