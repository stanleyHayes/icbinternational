/**
 * Behavioural constants for the biller rail.
 *
 * A rail that always succeeds teaches the bank nothing. These numbers describe how the
 * real bill-payment network behaves — most payments clear, a small share are rejected by
 * the biller, a smaller share time out — and they are stated here rather than scattered
 * through the simulator so the failure profile can be read in one place and tuned in one
 * place.
 */

/** Basis-point denominator. 10,000 bps is certainty. */
export const BPS_SCALE = 10_000;

/**
 * Share of submissions the biller network rejects outright, in basis points.
 *
 * Roughly one in forty. High enough that the reversal path is exercised in ordinary use
 * rather than only under a deliberate fault injection, low enough that the product still
 * feels like a bank.
 */
export const DEFAULT_REJECTION_BPS = 250;

/** Share of submissions that time out with no answer at all, in basis points. */
export const DEFAULT_TIMEOUT_BPS = 60;

/** Fastest a biller ever answers, in milliseconds. */
export const MIN_LATENCY_MS = 180;

/** Spread of the latency band above {@link MIN_LATENCY_MS}, in milliseconds. */
export const LATENCY_SPREAD_MS = 2_400;

/** Latency reported when the biller never answers at all. */
export const TIMEOUT_LATENCY_MS = 30_000;

/** Prefix on every receipt token the simulated network issues. */
export const RECEIPT_PREFIX = 'RB';

/** Characters a receipt token is drawn from — unambiguous when read aloud. */
export const RECEIPT_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Length of the random portion of a receipt token. */
export const RECEIPT_LENGTH = 10;

/** FNV-1a 32-bit offset basis. */
export const FNV_OFFSET_BASIS = 2_166_136_261;

/** FNV-1a 32-bit prime. */
export const FNV_PRIME = 16_777_619;
