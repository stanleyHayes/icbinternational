/**
 * The LIVENESS step: proving the selfie is a live person, present now.
 *
 * A failed check is not recorded against the customer — it is refused at the step with
 * a message to retake the photo, because the honest recovery from a bad capture is a
 * better capture, and the deterministic vendor gives every new artefact its own draw.
 * Only a LIVE result is written to the case, which means "liveness passed" on a
 * submitted case is a statement of fact, not an absence of evidence.
 */

import { Injectable } from '@nestjs/common';

import { DocumentKind, ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { KycCaseRepository } from './kyc-case.repository.js';
import { LivenessPort, LivenessVerdict } from './ports/kyc-vendor.ports.js';

@Injectable()
export class KycLivenessService {
  constructor(
    private readonly cases: KycCaseRepository,
    private readonly liveness: LivenessPort,
    private readonly clock: ClockService,
  ) {}

  /**
   * Runs the liveness check on a selfie attached to the customer's case.
   *
   * @throws {AppError} `KYC_DOCUMENT_INVALID` when the check does not come back LIVE —
   *   the customer is asked to retake the selfie, and nothing is recorded.
   */
  async verify(userId: string, selfieDocumentId: string): Promise<void> {
    const kycCase = await this.cases.findByUser(userId);
    const selfie = kycCase?.documents.find((doc) => doc.id === selfieDocumentId);
    if (!kycCase || !selfie || selfie.kind !== DocumentKind.SELFIE) {
      throw AppError.validation('That selfie does not belong to this application.', [
        { path: 'selfieDocumentId', message: 'Unknown selfie document.' },
      ]);
    }

    const result = await this.liveness.check({ selfieDocumentId, userId });
    if (result.verdict !== LivenessVerdict.LIVE) {
      throw new AppError({
        code: ErrorCode.KYC_DOCUMENT_INVALID,
        message:
          'We could not verify that photo. Please retake it in good light, looking straight at the camera.',
      });
    }

    await this.cases.patch(kycCase.id, {
      $set: {
        liveness: {
          selfieDocumentId,
          verdict: result.verdict,
          scoreBps: result.scoreBps,
          reference: result.reference,
          checkedAt: this.clock.now(),
        },
        documents: kycCase.documents.map((doc) => ({
          id: doc.id,
          kind: doc.kind,
          assetId: doc.assetId,
          fileAssetId: doc.fileAssetId,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          uploadedAt: doc.uploadedAt,
          verified: doc.id === selfieDocumentId || doc.verified,
          ocr: doc.ocr,
        })),
      },
    });
  }
}
