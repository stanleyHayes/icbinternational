import { createHmac } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppConfigService } from '../../config/config.service.js';
import { secretsMatch } from '../auth/support/tokens.js';

import { passkeyVerificationFailed } from './mfa.errors.js';

/** The two ceremonies a challenge can authorise. Binding the purpose stops cross-replay. */
export const CeremonyPurpose = {
  REGISTER: 'passkey-register',
  AUTHENTICATE: 'passkey-authenticate',
} as const;
export type CeremonyPurpose = (typeof CeremonyPurpose)[keyof typeof CeremonyPurpose];

/** A ceremony answers or dies within five minutes — same window as an MFA challenge. */
const CEREMONY_TTL_SECONDS = 300;
const SEPARATOR = '.';
const EXPECTED_PARTS = 5;
const MILLISECONDS_PER_SECOND = 1000;

/** An issued ceremony challenge and when it stops being answerable. */
export interface IssuedCeremony {
  challengeId: string;
  expiresAt: Date;
}

/**
 * Stateless WebAuthn ceremony challenges.
 *
 * The two legs of a WebAuthn ceremony — options, then verify — need the server to remember
 * the challenge it issued for a few minutes. Rather than a table of challenges, the
 * challenge is returned to the client inside an HMAC-signed token that also binds the user
 * and the ceremony purpose; the verify leg presents it and the signature is re-checked.
 * A five-minute expiry makes a stolen options response worthless quickly, and the purpose
 * binding stops a registration challenge being replayed as an authentication one.
 */
@Injectable()
export class WebAuthnChallengeService {
  /** Derived, not used directly, so these signatures cannot be confused with another key use. */
  private readonly key: Buffer;

  constructor(
    config: AppConfigService,
    private readonly clock: ClockService,
  ) {
    this.key = createHmac('sha256', config.encryptionKey)
      .update('reliance:webauthn-ceremony:v1')
      .digest();
  }

  /** Mints a signed token carrying the WebAuthn challenge for one user and purpose. */
  issue(userId: string, purpose: CeremonyPurpose, challenge: string): IssuedCeremony {
    const expiresAt = this.clock.inSeconds(CEREMONY_TTL_SECONDS);
    const expiresAtSeconds = Math.floor(expiresAt.getTime() / MILLISECONDS_PER_SECOND);
    const signature = this.sign([purpose, userId, challenge, String(expiresAtSeconds)]);

    return {
      challengeId: [purpose, userId, challenge, String(expiresAtSeconds), signature].join(
        SEPARATOR,
      ),
      expiresAt,
    };
  }

  /**
   * Reads the WebAuthn challenge out of a presented token, verifying purpose, subject,
   * expiry and signature.
   *
   * @throws {AppError} `PASSKEY_VERIFICATION_FAILED` for a forged, malformed, expired,
   *   wrong-purpose or wrong-user token — one answer for all, as with every credential.
   */
  assertValid(purpose: CeremonyPurpose, challengeId: string, userId: string): string {
    const parts = challengeId.split(SEPARATOR);
    const [tokenPurpose, tokenUserId, challenge, expiresAt, signature] = parts;

    if (
      parts.length !== EXPECTED_PARTS ||
      tokenPurpose !== purpose ||
      tokenUserId !== userId ||
      !challenge ||
      !expiresAt ||
      !signature
    ) {
      throw passkeyVerificationFailed();
    }

    if (Number(expiresAt) * MILLISECONDS_PER_SECOND <= this.clock.timestamp()) {
      throw passkeyVerificationFailed();
    }

    if (!secretsMatch(signature, this.sign([tokenPurpose, tokenUserId, challenge, expiresAt]))) {
      throw passkeyVerificationFailed();
    }

    return challenge;
  }

  private sign(parts: readonly string[]): string {
    return createHmac('sha256', this.key).update(parts.join('|')).digest('base64url');
  }
}
