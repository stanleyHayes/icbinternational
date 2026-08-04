/**
 * Submission: the moment a case stops being a wizard and becomes a decision.
 *
 * Submitting validates that every answer and every required document is in, computes
 * the risk rating from the sealed personal facts, and runs the automated first pass.
 * Clean tier-1 files are approved on the spot; anything heavier goes to the analyst
 * queue; prohibited files are declined. The machine's reason is recorded either way,
 * because a decision nobody can explain is not a decision a bank may make.
 */

import { Injectable } from '@nestjs/common';

import { ErrorCode, KycStatus, type FieldError, type RiskRating } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { evaluateSubmission, type SubmissionAssessment } from './domain/auto-decision.js';
import { isAtLeastAge, WORKFLOW_STEPS } from './domain/kyc-steps.js';
import { missingDocumentGroups } from './domain/required-documents.js';
import { computeRiskRating } from './domain/risk-rating.js';
import { KycCaseRepository } from './kyc-case.repository.js';
import { type KycCaseDocument } from './kyc-case.schema.js';
import { KycDecisionService } from './kyc-decision.service.js';
import { KycPiiStore } from './kyc-pii-store.service.js';
import { MINIMUM_AGE_YEARS } from './kyc.constants.js';
import { LivenessVerdict } from './ports/kyc-vendor.ports.js';

@Injectable()
export class KycSubmissionService {
  constructor(
    private readonly cases: KycCaseRepository,
    private readonly pii: KycPiiStore,
    private readonly decision: KycDecisionService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Submits the case for decision and returns its new state.
   *
   * @throws {AppError} `PRECONDITION_FAILED` listing what is still outstanding.
   */
  async submit(userId: string): Promise<KycCaseDocument> {
    const kycCase = await this.requireSubmittable(userId);
    const pii = this.pii.open(kycCase.pii);

    const riskRating = computeRiskRating({
      nationality: pii.nationality ?? null,
      residenceCountry: pii.address?.country ?? null,
      employmentStatus: pii.employmentStatus ?? null,
      sourceOfFunds: pii.sourceOfFunds ?? null,
      requestedTier: kycCase.requestedTier,
    });

    const submitted = await this.markSubmitted(kycCase.id, riskRating);
    const outcome = evaluateSubmission(this.assess(submitted, riskRating, pii.dateOfBirth));
    return this.decision.applyAutoOutcome(submitted.id, outcome);
  }

  /** The case when submission is currently allowed, or the refusal naming what is missing. */
  private async requireSubmittable(userId: string): Promise<KycCaseDocument> {
    const kycCase = await this.cases.findByUser(userId);
    if (!kycCase) throw AppError.notFound('KYC case');
    if (
      kycCase.status !== KycStatus.IN_PROGRESS &&
      kycCase.status !== KycStatus.MORE_INFO_REQUIRED
    ) {
      throw AppError.conflict(
        ErrorCode.KYC_PENDING_REVIEW,
        'This application has already been submitted.',
      );
    }
    assertComplete(kycCase);
    return kycCase;
  }

  /** Stamps the case as submitted, with the rating the decision will read. */
  private async markSubmitted(caseId: string, riskRating: RiskRating): Promise<KycCaseDocument> {
    const updated = await this.cases.patch(caseId, {
      $set: { status: KycStatus.SUBMITTED, submittedAt: this.clock.now(), riskRating },
      $addToSet: { completedSteps: 'REVIEW' },
    });
    if (!updated) throw AppError.notFound('KYC case', caseId);
    return updated;
  }

  /** Reduces the case to the facts the automated pass decides on. */
  private assess(
    kycCase: KycCaseDocument,
    riskRating: RiskRating,
    dateOfBirth: string | undefined,
  ): SubmissionAssessment {
    return {
      requestedTier: kycCase.requestedTier,
      riskRating,
      adult: dateOfBirth ? isAtLeastAge(dateOfBirth, this.clock.today(), MINIMUM_AGE_YEARS) : false,
      documentsVerified: kycCase.documents
        .filter((doc) => doc.ocr !== null)
        .every((doc) => doc.verified),
      livenessPassed: kycCase.liveness?.verdict === LivenessVerdict.LIVE,
    };
  }
}

/** Submission requires every step answered and every required document attached. */
function assertComplete(kycCase: KycCaseDocument): void {
  const details: FieldError[] = [];

  for (const step of WORKFLOW_STEPS) {
    if (!kycCase.completedSteps.includes(step)) {
      details.push({ path: 'completedSteps', message: `The ${step} step is not finished.` });
    }
  }
  for (const group of missingDocumentGroups(
    kycCase.requestedTier,
    kycCase.documents.map((doc) => doc.kind),
  )) {
    details.push({ path: 'documents', message: `Please attach ${group.join(' or ')}.` });
  }

  if (details.length > 0) {
    throw new AppError({
      code: ErrorCode.PRECONDITION_FAILED,
      message: 'This application is not ready to submit.',
      details,
    });
  }
}
