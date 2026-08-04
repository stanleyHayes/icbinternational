import { type Request } from 'express';

import { COOKIE } from '@reliance/contracts';

import { UNKNOWN_ORIGIN } from '../auth.constants.js';
import { type RequestOrigin } from '../auth.types.js';

/**
 * Reading request metadata, with the narrowing Express's types do not do for us.
 *
 * `cookie-parser` types `req.cookies` loosely and headers can be arrays, so every read
 * here goes through `unknown` and comes out a definite `string | undefined` — no `any`
 * leaking into the controllers.
 */

/** Where the request came from, as recorded on every session row. */
export function originOf(request: Request): RequestOrigin {
  return {
    ip: request.ip ?? UNKNOWN_ORIGIN,
    userAgent: headerValue(request, 'user-agent') ?? UNKNOWN_ORIGIN,
  };
}

/** The refresh token cookie, if the request carries one. */
export function refreshCookieOf(request: Request): string | undefined {
  return cookieValue(request, COOKIE.refreshToken);
}

/** The access token cookie, if the request carries one. */
export function accessCookieOf(request: Request): string | undefined {
  return cookieValue(request, COOKIE.accessToken);
}

/** The CSRF cookie, compared against the `x-csrf-token` header by `CsrfService`. */
export function csrfCookieOf(request: Request): string | undefined {
  return cookieValue(request, COOKIE.csrf);
}

/** A single-valued header, or undefined when absent or multi-valued. */
export function headerValue(request: Request, name: string): string | undefined {
  const value: unknown = request.headers[name.toLowerCase()];
  return typeof value === 'string' ? value : undefined;
}

function cookieValue(request: Request, name: string): string | undefined {
  const value: unknown = request.cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
