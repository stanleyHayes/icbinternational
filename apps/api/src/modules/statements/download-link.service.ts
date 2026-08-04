/**
 * Signed, expiring links to the documents this module renders.
 *
 * A statement or a letter is opened by clicking a link, often in a new tab and sometimes
 * from a phone's downloads list — neither of which carries the session cookie reliably.
 * So the link authorises itself: the bank signs the exact path and every parameter that
 * changes what the document says, and the document route accepts nothing else.
 * Entitlement is decided when the link is minted, by the service that has already
 * established the customer holds the account.
 *
 * The key is derived from the environment's encryption key with a fixed label rather than
 * used directly, so a download signature can never be confused with — or forged from —
 * anything else that key protects.
 *
 * An expired link is refused with `TOKEN_EXPIRED` rather than a flat 404, because the
 * customer's next move is to reopen the list and get a fresh one, and a 404 would tell
 * them their statement had vanished.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { API_PREFIX, ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { ENVIRONMENT } from '../../config/config.tokens.js';
import { type Environment } from '../../config/configuration.js';

import {
  DOWNLOAD_LINK_TTL_SECONDS,
  EXPIRES_PARAM,
  SIGNATURE_PARAM,
} from './statements.constants.js';

/** Parameters that form part of what is signed. */
export type SignedQuery = Readonly<Record<string, string>>;

/** Domain separation: this key signs download links and nothing else. */
const KEY_LABEL = 'reliance.document-download.v1';
const MILLISECONDS_PER_SECOND = 1000;

@Injectable()
export class DownloadLinkService {
  private readonly key: Buffer;
  private readonly origin: string;

  constructor(
    @Inject(ENVIRONMENT) environment: Environment,
    private readonly clock: ClockService,
  ) {
    this.key = createHmac('sha256', environment.ENCRYPTION_KEY).update(KEY_LABEL).digest();
    // `origin` rather than the raw value: it is normalised, has no trailing slash, and
    // cannot smuggle a path that would land the signature on a route nobody serves.
    this.origin = new URL(environment.API_URL).origin;
  }

  /** An absolute URL to `path`, good for the next quarter of an hour. */
  sign(path: string, query: SignedQuery = {}): string {
    const seconds = Math.floor(this.clock.timestamp() / MILLISECONDS_PER_SECOND);
    const expires = String(seconds + DOWNLOAD_LINK_TTL_SECONDS);
    const url = new URL(`${this.origin}${API_PREFIX}${path}`);

    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    url.searchParams.set(EXPIRES_PARAM, expires);
    url.searchParams.set(SIGNATURE_PARAM, this.digest(path, query, expires));
    return url.toString();
  }

  /**
   * Accepts a link the bank signed, and refuses everything else.
   *
   * @throws {AppError} `TOKEN_INVALID` when the signature does not cover exactly this
   *   path and these parameters, `TOKEN_EXPIRED` once the link has aged out.
   */
  verify(input: { path: string; query: SignedQuery; expires: string; signature: string }): void {
    if (!matches(this.digest(input.path, input.query, input.expires), input.signature)) {
      throw new AppError({
        code: ErrorCode.TOKEN_INVALID,
        message: 'That download link is not one we issued.',
      });
    }

    const expiresAt = Number(input.expires) * MILLISECONDS_PER_SECOND;
    if (!Number.isFinite(expiresAt) || expiresAt < this.clock.timestamp()) {
      throw new AppError({
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'That download link has expired. Open the document again for a fresh one.',
      });
    }
  }

  /** When a link minted now stops working. */
  expiresAt(): Date {
    return new Date(this.clock.timestamp() + DOWNLOAD_LINK_TTL_SECONDS * MILLISECONDS_PER_SECOND);
  }

  /** Parameters are sorted, so the same link signs the same way whatever order they arrive in. */
  private digest(path: string, query: SignedQuery, expires: string): string {
    const canonical = Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}=${value}`)
      .join('&');

    return createHmac('sha256', this.key)
      .update(`${path}\n${canonical}\n${expires}`)
      .digest('base64url');
  }
}

/** Constant-time comparison, so a wrong signature leaks nothing about the right one. */
function matches(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(supplied, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
