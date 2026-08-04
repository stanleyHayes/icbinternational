/**
 * Reading the answers the customer gave during onboarding.
 *
 * The profile screen shows the address, employer and income the bank holds. Those were
 * collected once, by the KYC wizard, and they live sealed inside the case that was decided
 * on them. This reader is the one place in the profile lane that opens that blob.
 *
 * It bends the house rule that a lane imports another lane only through its `index.ts`:
 * `openPii` is a pure function and is imported directly. The alternative was to re-derive
 * the KYC lane's at-rest format here — "a JSON object under `SecretCipher`" — which is the
 * same coupling written down twice, and it fails silently the day that format changes
 * rather than failing at compile time. The case document itself is obtained properly,
 * through the exported `KycCaseService`.
 *
 * Nothing here writes. Onboarding answers are evidence: they are what the identity check
 * was performed against, and a customer moving house does not change what was true when
 * their passport was verified. Corrections go to the profile's own record instead.
 */

import { Injectable, Logger } from '@nestjs/common';

import { type KycStatus } from '@reliance/contracts';

import { SecretCipher } from '../auth/support/secret-cipher.js';
import { KycCaseService } from '../kyc/index.js';
import { openPii, type KycPii } from '../kyc/kyc-pii.js';

/** The onboarding file as the profile lane needs it: a status and a set of answers. */
export interface KycAnswers {
  readonly status: KycStatus;
  readonly answers: KycPii;
}

@Injectable()
export class KycAnswersReader {
  private readonly logger = new Logger(KycAnswersReader.name);

  constructor(
    private readonly cases: KycCaseService,
    private readonly cipher: SecretCipher,
  ) {}

  /**
   * The customer's onboarding status and whatever they answered.
   *
   * A customer who has never started onboarding gets `NOT_STARTED` and no answers rather
   * than an error — the profile screen is not the place to discover that.
   */
  async read(userId: string): Promise<KycAnswers> {
    const kycCase = await this.cases.getStatus(userId);
    return { status: kycCase.status, answers: this.open(kycCase.pii) };
  }

  /**
   * Opens the sealed answers, degrading to none rather than failing the read.
   *
   * A blob that will not open is a real problem — a rotated key, a corrupted document —
   * but it is the bank's problem, not the customer's, and refusing to render their profile
   * over it helps nobody. The error is logged for someone to act on and the screen falls
   * back to whatever the customer has told us directly.
   */
  private open(sealed: string): KycPii {
    try {
      return openPii(this.cipher, sealed);
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.stack : String(error),
        'Sealed onboarding answers could not be opened; profile served without them',
      );
      return {};
    }
  }
}
