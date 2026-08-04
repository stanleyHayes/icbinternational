/**
 * Names, windows and thresholds shared across the cards module.
 *
 * A model name couples the schema, the repository and the module registration; a
 * reference prefix couples an authorisation to the journal entry that settles it. Both
 * are spelled once here so the copies cannot disagree.
 */

/** Mongoose model name for an issued card. */
export const CARD_MODEL = 'Card';

/** Mongoose model name for a card authorisation. */
export const CARD_AUTHORISATION_MODEL = 'CardAuthorisation';

/** Physical collection holding issued cards. */
export const CARD_COLLECTION = 'cards';

/** Physical collection holding authorisations, approved and declined alike. */
export const CARD_AUTHORISATION_COLLECTION = 'card_authorisations';

/** Transaction labels, so a retry-conflict log names the operation that caused it. */
export const CARD_TRANSACTION_LABEL = {
  ISSUE: 'cards.issue',
  ACTIVATE: 'cards.activate',
  REPLACE: 'cards.replace',
  AUTHORISE: 'cards.authorise',
  INCREMENT: 'cards.increment',
  CAPTURE: 'cards.capture',
  REVERSE: 'cards.reverse',
  REFUND: 'cards.refund',
  SETTLE: 'cards.settle',
} as const;

/** Prefix on the journal reference a card capture books. */
export const CARD_CAPTURE_REFERENCE_PREFIX = 'CRD-';

/** Prefix on the journal reference a card refund books. */
export const CARD_REFUND_REFERENCE_PREFIX = 'CRDRFD-';

/**
 * How long a revealed PAN stays valid on the client, in seconds.
 *
 * Short enough that a screenshot left on a shared machine is stale before anyone finds
 * it; long enough for somebody to type sixteen digits into a checkout. The client counts
 * down against the `validUntil` this produces and blanks the panel when it lapses.
 */
export const SENSITIVE_DETAILS_TTL_SECONDS = 60;

/**
 * Consecutive wrong PINs before the card stops accepting one.
 *
 * Three is the scheme convention and the number every cardholder already expects from an
 * ATM. The lock is time-boxed rather than permanent, because a customer who mistyped
 * their PIN on holiday should not need a branch visit to buy dinner.
 */
export const MAX_PIN_ATTEMPTS = 3;

/** How long a card stops accepting a PIN after the attempt limit is reached. */
export const PIN_LOCKOUT_MINUTES = 60;

/** Days a physical card spends in each stage of production and delivery. */
export const DELIVERY_STAGE_DAYS = {
  PRINTING: 1,
  SHIPPED: 2,
  DELIVERED: 5,
} as const;

/** Most cards one account may hold at once, across every format. */
export const MAX_CARDS_PER_ACCOUNT = 5;

/** How many authorisations one expiry sweep resolves. */
export const AUTHORISATION_EXPIRY_BATCH = 250;

/** How many cleared authorisations one settlement batch may close over. */
export const SETTLEMENT_BATCH_LIMIT = 500;

/** Default sort direction for feeds: newest first, as a statement reads. */
export const NEWEST_FIRST = -1;

/** Countries a new card may be used in before the customer widens the list. */
export const DEFAULT_ALLOWED_COUNTRIES: readonly string[] = Object.freeze(['GB']);

/** Merchant categories blocked on a new card until the customer opts in. */
export const DEFAULT_BLOCKED_MCCS: readonly string[] = Object.freeze([
  // Gambling. Blocked by default so a card is never the path of least resistance into it.
  '7995',
  // Cryptocurrency and quasi-cash. The commonest destination of a compromised card.
  '6051',
]);
