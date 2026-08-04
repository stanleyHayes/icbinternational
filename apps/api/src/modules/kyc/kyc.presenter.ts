/**
 * Turns a stored case into the contract's wire shape.
 *
 * The one thing that only exists at presentation time is the preview URL: restricted
 * KYC material is never publicly addressable, so every read signs a fresh short-lived
 * URL rather than storing one. A leaked response body therefore expires in minutes,
 * and revoking access is a matter of not signing again.
 */

import { Injectable } from '@nestjs/common';

import { KycStatus, type CustomerDocument, type KycCase, type KycStep } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { MediaStoragePort } from '../files/index.js';

import { nextStepFor } from './domain/kyc-steps.js';
import { type KycAttachedDocument, type KycCaseRecord } from './kyc-case.schema.js';
import { KYC_PREVIEW_TTL_SECONDS } from './kyc.constants.js';

/** Anything with the case's stored fields — a hydrated document or a plain snapshot. */
export type KycCaseSource = Pick<
  KycCaseRecord,
  | 'id'
  | 'userId'
  | 'status'
  | 'currentTier'
  | 'requestedTier'
  | 'completedSteps'
  | 'documents'
  | 'riskRating'
  | 'reviewerMessage'
  | 'submittedAt'
  | 'decidedAt'
  | 'expiresAt'
  | 'createdAt'
  | 'updatedAt'
>;

@Injectable()
export class KycPresenter {
  constructor(
    private readonly storage: MediaStoragePort,
    private readonly clock: ClockService,
  ) {}

  /** The full case as the contract defines it, with freshly-signed previews. */
  async present(kycCase: KycCaseSource): Promise<KycCase> {
    return {
      id: kycCase.id,
      userId: kycCase.userId,
      status: kycCase.status,
      currentTier: kycCase.currentTier,
      requestedTier: kycCase.requestedTier,
      completedSteps: [...kycCase.completedSteps],
      nextStep: this.nextStep(kycCase),
      documents: await Promise.all(kycCase.documents.map((doc) => this.presentDocument(doc))),
      riskRating: kycCase.riskRating,
      reviewerMessage: kycCase.reviewerMessage,
      submittedAt: kycCase.submittedAt?.toISOString() ?? null,
      decidedAt: kycCase.decidedAt?.toISOString() ?? null,
      expiresAt: kycCase.expiresAt?.toISOString() ?? null,
      createdAt: kycCase.createdAt.toISOString(),
      updatedAt: kycCase.updatedAt.toISOString(),
    };
  }

  /** One document envelope with a freshly-signed preview URL. */
  async presentDocument(doc: KycAttachedDocument): Promise<CustomerDocument> {
    return {
      id: doc.id,
      kind: doc.kind,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      previewUrl: await this.signPreview(doc.assetId),
      uploadedAt: doc.uploadedAt.toISOString(),
      verified: doc.verified,
    };
  }

  /**
   * A short-lived signed URL for one artefact — the only way restricted KYC material
   * is ever addressed.
   */
  private signPreview(storageKey: string): Promise<string> {
    return this.storage.signedUrl({
      storageKey,
      ttlSeconds: KYC_PREVIEW_TTL_SECONDS,
      issuedAt: this.clock.now(),
    });
  }

  /** The wizard position: derived while editing, settled once the case leaves the wizard. */
  private nextStep(kycCase: KycCaseSource): KycStep | null {
    const settled: readonly string[] = [
      KycStatus.SUBMITTED,
      KycStatus.UNDER_REVIEW,
      KycStatus.APPROVED,
      KycStatus.REJECTED,
      KycStatus.EXPIRED,
    ];
    if (settled.includes(kycCase.status)) return null;
    return nextStepFor(kycCase.completedSteps);
  }
}
