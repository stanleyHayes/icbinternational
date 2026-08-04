/**
 * The browser's identity, as far as risk scoring is concerned.
 *
 * The API asks for a stable per-browser fingerprint on sign-in so it can tell "the laptop she uses
 * every morning" from "a machine in another country". It does not need to be unforgeable — a
 * fingerprint is one input to a risk score, never a credential — it needs to be *stable*, because
 * a value that changes on every load makes every sign-in look like a new device and buries the one
 * that genuinely is.
 *
 * So: a random identifier, minted once and kept in `localStorage`. No canvas or font probing. That
 * kind of fingerprinting survives a storage clear, which is precisely why it is the sort of thing a
 * bank should not be doing to people who have asked to be forgotten.
 */

const STORAGE_KEY = 'rb.device';
const ID_BYTES = 16;
const HEX_RADIX = 16;
const HEX_PAD = 2;

/** Long enough that the contract's `min(8)` can never be tripped by a short random value. */
function mint(): string {
  const bytes = new Uint8Array(ID_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(HEX_RADIX).padStart(HEX_PAD, '0')).join('');
}

/**
 * This browser's fingerprint, creating one on first use.
 *
 * Falls back to a fresh value when storage is unavailable — a private window still has to be able
 * to sign in, it just will not be recognised next time, which is the correct outcome for it.
 */
export function deviceFingerprint(): string {
  try {
    const existing = globalThis.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const minted = mint();
    globalThis.localStorage.setItem(STORAGE_KEY, minted);
    return minted;
  } catch {
    return mint();
  }
}

const MOBILE = /iphone|ipad|android/i;

/** Checked in order: Chrome's agent string also mentions Safari, and Edge's mentions both. */
const BROWSERS: readonly { readonly pattern: RegExp; readonly name: string }[] = [
  { pattern: /edg\//i, name: 'Edge' },
  { pattern: /firefox\//i, name: 'Firefox' },
  { pattern: /chrome\//i, name: 'Chrome' },
  { pattern: /safari\//i, name: 'Safari' },
];

/**
 * A human label for this browser, for the "where you are signed in" list.
 *
 * Derived from the user agent rather than sent by the client as fact: the API records its own view
 * too, and the two disagreeing is itself a signal.
 */
export function deviceLabel(): string {
  const agent = globalThis.navigator?.userAgent ?? '';
  const platform = MOBILE.test(agent) ? 'phone' : 'computer';
  const match = BROWSERS.find((candidate) => candidate.pattern.test(agent));
  return `${match?.name ?? 'Browser'} on this ${platform}`;
}
