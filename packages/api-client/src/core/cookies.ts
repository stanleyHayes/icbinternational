/**
 * Reading the one cookie the client is allowed to read.
 *
 * Access and refresh tokens are httpOnly and therefore invisible to this code, which is
 * the point — the browser attaches them, script cannot exfiltrate them. The CSRF token
 * is deliberately *not* httpOnly: the double-submit defence requires script to read it
 * from the cookie and echo it in a header, which a cross-site page cannot do.
 */

/** Returns the value of a cookie, or `null` when it is absent. */
export type CookieReader = (name: string) => string | null;

/** Reader for a browser document. Returns `null` everywhere else. */
export const documentCookieReader: CookieReader = (name) => {
  if (typeof document === 'undefined') return null;
  return readCookie(document.cookie, name);
};

/** Reader for server-rendered contexts, which must supply the header themselves. */
export const noCookieReader: CookieReader = () => null;

/** Builds a reader over a raw `Cookie` header — the shape a server framework hands you. */
export function cookieHeaderReader(header: string): CookieReader {
  return (name) => readCookie(header, name);
}

const NAME_VALUE_PARTS = 2;

function readCookie(header: string, name: string): string | null {
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    const key = pair.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeCookieValue(pair.slice(separator + 1).trim());
  }
  return null;
}

/**
 * A cookie value is percent-encoded by whoever set it, but a malformed value must not
 * take down the request — a failed decode simply means the raw value is the best we have.
 */
function decodeCookieValue(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Splits a `Cookie` header into a plain record. Useful for tests and SSR plumbing. */
export function parseCookieHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const parts = pair.split('=');
    if (parts.length < NAME_VALUE_PARTS) continue;
    const [key, ...rest] = parts;
    if (key === undefined) continue;
    result[key.trim()] = decodeCookieValue(rest.join('=').trim());
  }
  return result;
}
