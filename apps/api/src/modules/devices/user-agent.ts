/**
 * Turning a user-agent string into something a customer recognises.
 *
 * The security screen has to let someone answer "was that me?" in about two seconds.
 * "Chrome on macOS" does that; the 140-character UA string does not. This is presentation
 * only — no authorisation decision anywhere reads it, so the well-known fact that a UA can
 * say anything it likes costs nothing here.
 */

/** Matched in order; the first hit wins, so specific entries precede general ones. */
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/edg\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/chrome|crios/i, 'Chrome'],
  [/firefox|fxios/i, 'Firefox'],
  [/safari/i, 'Safari'],
];

const PLATFORMS: readonly (readonly [RegExp, string])[] = [
  [/iphone|ipad|ipod/i, 'iOS'],
  [/android/i, 'Android'],
  [/mac os x|macintosh/i, 'macOS'],
  [/windows/i, 'Windows'],
  [/linux/i, 'Linux'],
];

const UNKNOWN_BROWSER = 'Unknown browser';
const UNKNOWN_PLATFORM = 'Unknown platform';

/** A device's display name and platform, derived from its user agent. */
export interface DeviceDescription {
  label: string;
  platform: string;
}

/** Describes a user agent as `Browser on Platform`. */
export function describeUserAgent(userAgent: string): DeviceDescription {
  const browser = firstMatch(BROWSERS, userAgent) ?? UNKNOWN_BROWSER;
  const platform = firstMatch(PLATFORMS, userAgent) ?? UNKNOWN_PLATFORM;

  return { label: `${browser} on ${platform}`, platform };
}

function firstMatch(table: readonly (readonly [RegExp, string])[], value: string): string | null {
  for (const [pattern, name] of table) {
    if (pattern.test(value)) return name;
  }
  return null;
}
