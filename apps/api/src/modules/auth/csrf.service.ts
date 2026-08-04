import { Injectable } from '@nestjs/common';

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/config.service.js';

import { hmacSha256Url, randomToken, secretsMatch } from './support/tokens.js';

const VALUE_SEPARATOR = '.';

/**
 * Double-submit CSRF protection.
 *
 * The `rb.csrf` cookie holds `token.signature` and is deliberately *not* httpOnly: the
 * client reads it and echoes the whole value in the `x-csrf-token` header. A cross-site
 * attacker can force the browser to send cookies but cannot read them, so a request
 * without the matching header did not come from our client.
 *
 * The HMAC signature closes the remaining hole — an attacker planting a cookie of their
 * own choosing (a subdomain, a man-in-the-middle on plain HTTP) still cannot produce a
 * value the server itself signed.
 */
@Injectable()
export class CsrfService {
  constructor(private readonly config: AppConfigService) {}

  /** Mints a fresh `token.signature` cookie value. */
  issue(): string {
    const token = randomToken();
    return `${token}${VALUE_SEPARATOR}${this.sign(token)}`;
  }

  /**
   * Checks the header against the cookie and the cookie against its signature.
   *
   * @throws {AppError} `FORBIDDEN` when either is missing, they differ, or the cookie was
   *   not minted by this server. One message for every failure — the distinction is
   *   server-side detail.
   */
  assert(headerValue: string | undefined, cookieValue: string | undefined): void {
    const genuine =
      headerValue !== undefined &&
      cookieValue !== undefined &&
      secretsMatch(headerValue, cookieValue) &&
      this.isGenuine(cookieValue);

    if (!genuine) {
      throw new AppError({
        code: ErrorCode.FORBIDDEN,
        message: 'Security token mismatch. Reload the page and try again.',
      });
    }
  }

  /** A cookie value is genuine only if its signature verifies under our secret. */
  private isGenuine(value: string): boolean {
    const [token, signature] = value.split(VALUE_SEPARATOR);
    if (!token || !signature) return false;
    return secretsMatch(signature, this.sign(token));
  }

  private sign(token: string): string {
    return hmacSha256Url(this.config.cookies.csrfSecret, token);
  }
}
