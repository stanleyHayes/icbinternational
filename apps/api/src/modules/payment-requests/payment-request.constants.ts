/**
 * Names, windows and copy for peer payment requests.
 *
 * The share link and the QR payload are built from the same token, so a request scanned
 * from a phone screen and a request opened from a message are provably the same request.
 */

/** Mongoose model name for a peer payment request. */
export const PAYMENT_REQUEST_MODEL = 'PaymentRequest';

/** Physical collection holding payment requests. */
export const PAYMENT_REQUEST_COLLECTION = 'payment_requests';

/**
 * The bank's public payment-link host.
 *
 * A short, dedicated domain rather than a path on the app: the link is pasted into
 * messages, read aloud and printed on receipts, and every character of it is one more thing
 * to get wrong.
 */
export const SHARE_URL_BASE = 'https://pay.reliancebank.example/r/';

/** Scheme the mobile app registers, so a scanned code opens the request in-app. */
export const QR_SCHEME = 'reliance://pay/';

/** Default life of a request when the caller does not say. Three days. */
export const DEFAULT_EXPIRY_HOURS = 72;

/** Milliseconds in an hour, for expiry arithmetic. */
export const MS_PER_HOUR = 3_600_000;

/** Milliseconds in a second, for `Retry-After` arithmetic. */
export const MS_PER_SECOND = 1_000;

/** Job name for the expiry sweep. */
export const REQUEST_EXPIRY_JOB = 'payment-requests.expire';

/** Interval between expiry sweeps, in milliseconds. */
export const REQUEST_EXPIRY_INTERVAL_MS = 300_000;

/** Requests expired in one sweep. Bounded so one busy hour cannot starve the queue. */
export const REQUEST_EXPIRY_BATCH = 500;

/** Journal reference prefix for the entry that settles a request. */
export const REQUEST_REFERENCE_PREFIX = 'req:';

/** The most people one bill may be split across. Matches the contract's own ceiling. */
export const MAX_SPLIT_PARTICIPANTS = 20;

/** The most reminders one request may send, however many times the button is pressed. */
export const MAX_NUDGES = 3;

/** Quietest interval between reminders, in hours. A nudge an hour is harassment. */
export const MIN_NUDGE_INTERVAL_HOURS = 24;

/** Length of the share token. Long enough that a link cannot be guessed. */
export const TOKEN_BYTES = 16;
