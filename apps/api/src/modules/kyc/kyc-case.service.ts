/**
 * The customer's side of the case: opening it, answering its steps, reading it back.
 *
 * One case per customer, idempotent everywhere it matters. `start` on an open case
 * hands the same case back rather than forking a second file; a step answered twice
 * leaves one answer; a case whose approval has lapsed is retired on read, so the
 * status a customer sees is never quietly stale.
 */

import { Injectable } from '@nestjs/common';

import { ErrorCode, KycStatus, type FieldError } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';

import { isAtLeastAge, isEditable, withStepCompleted } from './domain/kyc-steps.js';
import { missingDocumentGroups } from './domain/required-documents.js';
import { KycCaseRepository } from './kyc-case.repository.js';
import { type KycCaseDocument } from './kyc-case.schema.js';
import { KycExpiryService } from './kyc-expiry.service.js';
import { KycLivenessService } from './kyc-liveness.service.js';
import { KycPiiStore } from './kyc-pii-store.service.js';
import { type KycPii } from './kyc-pii.js';
import { MINIMUM_AGE_YEARS } from './kyc.constants.js';
import { type SubmitKycStepApi } from './kyc.dto.js';

@Injectable()
export class KycCaseService {
  constructor(
    private readonly cases: KycCaseRepository,
    private readonly pii: KycPiiStore,
    private readonly liveness: KycLivenessService,
    private readonly expiry: KycExpiryService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  /**
   * Opens the customer's case, or hands back the one they already have.
   *
   * A decided case (REJECTED, EXPIRED) is reopened in place: one customer, one file,
   * with the history in the audit trail rather than in sibling rows.
   */
  async start(userId: string, requestedTier: number): Promise<KycCaseDocument> {
    const existing = await this.cases.findByUser(userId);
    if (!existing) return this.openFresh(userId, requestedTier);

    if (await this.expiry.expireIfDue(existing)) {
      return this.reopen(existing.id, requestedTier);
    }
    if (isEditable(existing.status)) {
      if (existing.requestedTier === requestedTier) return existing;
      const updated = await this.cases.patch(existing.id, { $set: { requestedTier } });
      return updated ?? existing;
    }
    if (existing.status === KycStatus.REJECTED || existing.status === KycStatus.EXPIRED) {
      return this.reopen(existing.id, requestedTier);
    }
    return existing;
  }

  /**
   * The customer's case as it stands.
   *
   * A customer who has never started gets a `NOT_STARTED` view rather than a 404 — the
   * wizard treats "no case yet" as a screen, not an error.
   */
  async getStatus(userId: string): Promise<KycCaseDocument> {
    const kycCase = await this.cases.findByUser(userId);
    if (!kycCase) return this.unstarted(userId);
    await this.expiry.expireIfDue(kycCase);
    return (await this.cases.findByUser(userId)) ?? kycCase;
  }

  /**
   * Answers one step of the wizard and advances the case.
   *
   * Idempotent by identity: answering a step again replaces the answer, it does not
   * stack a second one. The server recomputes `nextStep` from the completed set, so a
   * resumed wizard lands where the bank says it is.
   */
  async submitStep(userId: string, request: SubmitKycStepApi): Promise<KycCaseDocument> {
    const kycCase = await this.requireEditableCase(userId);
    await this.applyStep(kycCase, request);

    const completedSteps = withStepCompleted(kycCase.completedSteps, request.step);
    const updated = await this.cases.patch(kycCase.id, { $set: { completedSteps } });
    return updated ?? kycCase;
  }

  /** Applies the step's answer to the case's stored facts. */
  private async applyStep(kycCase: KycCaseDocument, request: SubmitKycStepApi): Promise<void> {
    if (request.step === 'LIVENESS') {
      await this.liveness.verify(kycCase.userId, request.selfieDocumentId);
      return;
    }
    if (request.step === 'DOCUMENTS') {
      assertDocumentsPresent(kycCase);
      return;
    }
    if (request.step === 'IDENTITY') {
      this.assertAdult(request.dateOfBirth);
    }
    const patch = stepAnswers(request);
    const sealed = this.pii.merge(kycCase.pii, patch);
    await this.cases.patch(kycCase.id, { $set: { pii: sealed } });
  }

  /** The statutory age check, applied at the moment identity is asserted. */
  private assertAdult(dateOfBirth: string): void {
    if (isAtLeastAge(dateOfBirth, this.clock.today(), MINIMUM_AGE_YEARS)) return;
    throw AppError.validation('You must be at least 18 years old to open an account.', [
      { path: 'dateOfBirth', message: 'You must be at least 18 years old.' },
    ]);
  }

  /** The case while it may still be changed, or the refusal. */
  private async requireEditableCase(userId: string): Promise<KycCaseDocument> {
    const kycCase = await this.cases.findByUser(userId);
    if (!kycCase) throw AppError.notFound('KYC case');
    if (isEditable(kycCase.status)) return kycCase;
    throw AppError.conflict(
      ErrorCode.CONFLICT,
      'This application has already been submitted and can no longer be changed.',
    );
  }

  /** Creates the case's first version. */
  private openFresh(userId: string, requestedTier: number): Promise<KycCaseDocument> {
    return this.cases.insertCase({
      id: this.ids.generate('kycCase'),
      userId,
      status: KycStatus.IN_PROGRESS,
      requestedTier,
      currentTier: 0,
      completedSteps: [],
      documents: [],
      liveness: null,
      riskRating: null,
      reviewerMessage: null,
      pii: this.pii.empty(),
      submittedAt: null,
      decidedAt: null,
      expiresAt: null,
      decidedBy: null,
      decisionReason: null,
    });
  }

  /** Resets a decided case to the start of the wizard. */
  private async reopen(caseId: string, requestedTier: number): Promise<KycCaseDocument> {
    const updated = await this.cases.patch(caseId, {
      $set: {
        status: KycStatus.IN_PROGRESS,
        requestedTier,
        completedSteps: [],
        riskRating: null,
        reviewerMessage: null,
        submittedAt: null,
        decidedAt: null,
        expiresAt: null,
        decidedBy: null,
        decisionReason: null,
      },
    });
    if (!updated) throw AppError.notFound('KYC case', caseId);
    return updated;
  }

  /** The never-started view. A shell of a case — nothing is persisted. */
  private unstarted(userId: string): KycCaseDocument {
    const now = this.clock.now();
    return {
      id: this.ids.generate('kycCase'),
      userId,
      status: KycStatus.NOT_STARTED,
      currentTier: 0,
      requestedTier: 0,
      completedSteps: [],
      documents: [],
      liveness: null,
      riskRating: null,
      reviewerMessage: null,
      pii: '',
      submittedAt: null,
      decidedAt: null,
      expiresAt: null,
      decidedBy: null,
      decisionReason: null,
      createdAt: now,
      updatedAt: now,
    } as unknown as KycCaseDocument;
  }
}

/** Extracts one step's personal answers as a PII patch. */
function stepAnswers(request: SubmitKycStepApi): KycPii {
  switch (request.step) {
    case 'IDENTITY':
      return { dateOfBirth: request.dateOfBirth, nationality: request.nationality };
    case 'ADDRESS':
      return { address: request.address };
    case 'EMPLOYMENT':
      return definedOnly({
        employmentStatus: request.employmentStatus,
        occupation: request.occupation,
        employerName: request.employerName,
        annualIncome: request.annualIncome,
      });
    case 'SOURCE_OF_FUNDS':
      return definedOnly({
        sourceOfFunds: request.sourceOfFunds,
        sourceOfFundsDetail: request.detail,
      });
    default:
      return {};
  }
}

/**
 * Drops undefined keys so an unanswered optional field does not erase a stored one.
 *
 * The entries are widened to `unknown` deliberately. Under `exactOptionalPropertyTypes` an
 * absent optional field is absent rather than `undefined`, so TypeScript reads the filter
 * as always true and the analyser flags it as dead. It is not: a caller spreading a
 * partially-built object can still hand over an explicit `undefined`, and letting that
 * through would blank a value the customer had already given us.
 */
function definedOnly(patch: KycPii): KycPii {
  const entries: readonly [string, unknown][] = Object.entries(patch);
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as KycPii;
}

/** The DOCUMENTS marker is only answerable once the tier's evidence is attached. */
function assertDocumentsPresent(kycCase: KycCaseDocument): void {
  const kinds = kycCase.documents.map((doc) => doc.kind);
  const missing = missingDocumentGroups(kycCase.requestedTier, kinds);
  if (missing.length === 0) return;

  const details: FieldError[] = missing.map((group) => ({
    path: 'documents',
    message: `Please attach ${group.join(' or ')}.`,
  }));
  throw new AppError({
    code: ErrorCode.KYC_REQUIRED,
    message: 'Some required documents have not been attached yet.',
    details,
  });
}
