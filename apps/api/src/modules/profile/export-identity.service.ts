/**
 * The "who you are" half of a subject-access copy.
 *
 * **What is deliberately left out, and why.** A subject-access request is a right to the
 * personal data the bank holds about you; it is not a right to the credentials that protect
 * it, and handing those over in a file the customer will email to themselves would make the
 * export the weakest point in the whole system. So:
 *
 * - **Password hash** — excluded. It is not personal data, it is the lock on the account,
 *   and an offline cracking target is exactly what it must never become.
 * - **TOTP secret and recovery-code hashes** — excluded. Either one reduces two-factor
 *   authentication to one, permanently, for anybody who reads the file.
 * - **Session and refresh tokens** — excluded. They are bearer credentials: a copy of one
 *   is a working copy of the customer's session.
 *
 * None of the three is a judgement call made here. `toUserView` builds its answer field by
 * field and the secret columns are `select: false` on the schema besides, so this file
 * cannot leak them even by mistake — which is the property that matters, because
 * "we remembered not to" is not a control.
 */

import { Injectable } from '@nestjs/common';

import { toUserView, UsersService } from '../auth/users/index.js';
import { KycCaseService } from '../kyc/index.js';

import { ProfileService } from './profile.service.js';

/** The onboarding file as it appears in an export: workflow, not evidence. */
interface OnboardingSection {
  readonly status: string;
  readonly currentTier: number;
  readonly requestedTier: number;
  readonly completedSteps: readonly string[];
  readonly riskRating: string | null;
  readonly reviewerMessage: string | null;
  readonly documents: readonly OnboardingDocument[];
  readonly submittedAt: string | null;
  readonly decidedAt: string | null;
  readonly expiresAt: string | null;
}

/** A document envelope. The file itself is not inlined — see the note on `documents`. */
interface OnboardingDocument {
  readonly kind: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly uploadedAt: string;
  readonly verified: boolean;
}

@Injectable()
export class ExportIdentityService {
  constructor(
    private readonly users: UsersService,
    private readonly profiles: ProfileService,
    private readonly onboarding: KycCaseService,
  ) {}

  /** The customer's identity record, credentials removed by construction. */
  async identity(userId: string): Promise<Record<string, unknown>> {
    return { ...toUserView(await this.users.requireById(userId)) };
  }

  /** The details the bank holds: onboarding answers overlaid with the customer's own. */
  async profile(userId: string): Promise<Record<string, unknown>> {
    return { ...(await this.profiles.get(userId)) };
  }

  /**
   * The onboarding file's workflow and the envelopes of what was uploaded.
   *
   * The answers themselves are not repeated here — they are the `PROFILE` section, and
   * writing the same personal data into the file twice serves nobody.
   *
   * The documents are listed but not inlined. A passport scan is already the customer's
   * own copy of their own document, and embedding megabytes of image into a JSON payload
   * that is then sealed and stored would multiply the bank's copies of it rather than
   * reduce them. The envelope tells the customer exactly what we hold and when it arrived.
   */
  async onboardingFile(userId: string): Promise<OnboardingSection> {
    const kycCase = await this.onboarding.getStatus(userId);

    return {
      status: kycCase.status,
      currentTier: kycCase.currentTier,
      requestedTier: kycCase.requestedTier,
      completedSteps: [...kycCase.completedSteps],
      riskRating: kycCase.riskRating,
      reviewerMessage: kycCase.reviewerMessage,
      documents: kycCase.documents.map((document) => ({
        kind: document.kind,
        fileName: document.fileName,
        sizeBytes: document.sizeBytes,
        uploadedAt: document.uploadedAt.toISOString(),
        verified: document.verified,
      })),
      submittedAt: kycCase.submittedAt?.toISOString() ?? null,
      decidedAt: kycCase.decidedAt?.toISOString() ?? null,
      expiresAt: kycCase.expiresAt?.toISOString() ?? null,
    };
  }
}
