import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import { toDataURL } from 'qrcode';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppConfigService } from '../../config/config.service.js';
import { SecretCipher } from '../auth/support/secret-cipher.js';

/** RFC 6238 default. Changing it would invalidate every already-enrolled authenticator. */
const PERIOD_SECONDS = 30;

/**
 * Accepted clock skew, in seconds, either side of now.
 *
 * One period. Phones drift, and a customer typing a code as it turns over should not be
 * told they are wrong; widening it further would extend how long an observed code stays
 * usable, which is precisely what the replay guard exists to prevent.
 */
const EPOCH_TOLERANCE_SECONDS = PERIOD_SECONDS;

const MILLISECONDS_PER_SECOND = 1000;

/** An enrolment offer: what to store, what to display, and what to scan. */
export interface TotpEnrolment {
  /** Encrypted, for the user document. */
  sealedSecret: string;
  /** Plaintext base32, shown once for manual entry. */
  secret: string;
  otpauthUri: string;
  qrCodeDataUri: string;
}

/** A successful verification, carrying the time step to record against replay. */
export interface TotpAcceptance {
  accepted: boolean;
  timeStep: number | null;
}

/**
 * Time-based one-time passwords.
 *
 * Two details matter more than the algorithm. Verification is anchored to
 * `ClockService`, so advancing the simulated clock a month does not invalidate every
 * enrolled authenticator. And every acceptance returns its RFC 6238 time step, which the
 * caller stores: a code stays mathematically valid for a whole period, so without
 * recording the step, a code read over someone's shoulder could be used again seconds
 * later.
 */
@Injectable()
export class TotpService {
  constructor(
    private readonly cipher: SecretCipher,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Mints a secret and everything needed to enrol an authenticator app.
   *
   * The QR code is generated server-side as a data URI so that the secret never travels to
   * a third-party chart service, which is the usual way this endpoint leaks.
   */
  async createEnrolment(accountLabel: string): Promise<TotpEnrolment> {
    const secret = generateSecret();
    const otpauthUri = generateURI({
      issuer: this.config.bank.name,
      label: accountLabel,
      secret,
      period: PERIOD_SECONDS,
    });

    return {
      secret,
      sealedSecret: this.cipher.seal(secret),
      otpauthUri,
      qrCodeDataUri: await toDataURL(otpauthUri),
    };
  }

  /**
   * Checks a code against a sealed secret.
   *
   * @param afterTimeStep The highest step already spent; anything at or below it is
   *   refused even when the arithmetic checks out.
   */
  async check(
    sealedSecret: string,
    code: string,
    afterTimeStep: number | null,
  ): Promise<TotpAcceptance> {
    const result = await verify({
      secret: this.cipher.open(sealedSecret),
      token: code,
      epoch: Math.floor(this.clock.timestamp() / MILLISECONDS_PER_SECOND),
      period: PERIOD_SECONDS,
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
      ...(afterTimeStep === null ? {} : { afterTimeStep }),
    });

    return result.valid
      ? { accepted: true, timeStep: 'timeStep' in result ? result.timeStep : null }
      : { accepted: false, timeStep: null };
  }
}
