/**
 * Persistence shape of a KYC case.
 *
 * One case per customer (unique `userId`): a returning customer reopens the same case
 * rather than spawning a parallel one, so there is never a question about which of two
 * files is current. The history of how it got here lives in the audit trail, not in
 * sibling rows.
 *
 * Personal answers are NOT fields on this document — they live sealed in `pii`
 * (see `kyc-pii.ts`). Everything stored in the clear here is workflow metadata that is
 * safe to index: status, tier, steps, timestamps, and document envelopes (a filename,
 * not a file).
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import {
  DocumentKind,
  KycStatus,
  RiskRating,
  type DocumentKind as DocumentKindType,
  type KycStatus as KycStatusType,
  type KycStep,
  type RiskRating as RiskRatingType,
} from '@reliance/contracts';

import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  publicIdProp,
} from '../../database/schema.helpers.js';

import { KYC_CASE_COLLECTION } from './kyc.constants.js';

const MAX_KYC_TIER = 3;

/** The OCR verdict recorded against a document. */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class KycOcrResult {
  @Prop({ type: String, required: true })
  verdict!: string;

  /** Confidence in basis points. */
  @Prop({ type: Number, required: true })
  confidenceBps!: number;
}

export const KycOcrResultSchema = SchemaFactory.createForClass(KycOcrResult);

/** A document envelope attached to the case. The bytes live in object storage. */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class KycAttachedDocument {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, enum: Object.values(DocumentKind), required: true })
  kind!: DocumentKindType;

  /** Provider-side object key (`storageKey`); the signed-upload handshake returns it. */
  @Prop({ type: String, required: true })
  assetId!: string;

  /** The file register's record for the same artefact. */
  @Prop({ type: String, required: true })
  fileAssetId!: string;

  @Prop({ type: String, required: true })
  fileName!: string;

  @Prop({ type: String, required: true })
  mimeType!: string;

  @Prop({ type: Number, required: true })
  sizeBytes!: number;

  @Prop({ type: Date, required: true })
  uploadedAt!: Date;

  /** True once OCR (or liveness, for a selfie) has accepted the artefact. */
  @Prop({ type: Boolean, default: false })
  verified!: boolean;

  @Prop({ type: KycOcrResultSchema, default: null })
  ocr!: KycOcrResult | null;
}

export const KycCaseDocumentSchema = SchemaFactory.createForClass(KycAttachedDocument);

/** The liveness outcome on the selfie, recorded when the LIVENESS step is answered. */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class KycLivenessResult {
  @Prop({ type: String, required: true })
  selfieDocumentId!: string;

  @Prop({ type: String, required: true })
  verdict!: string;

  /** Likeness score in basis points. */
  @Prop({ type: Number, required: true })
  scoreBps!: number;

  /** Vendor-side reference, for dispute reconstruction. */
  @Prop({ type: String, required: true })
  reference!: string;

  @Prop({ type: Date, required: true })
  checkedAt!: Date;
}

export const KycLivenessResultSchema = SchemaFactory.createForClass(KycLivenessResult);

/** The onboarding file of one customer. */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: KYC_CASE_COLLECTION })
export class KycCaseRecord {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  userId!: string;

  @Prop({ type: String, enum: Object.values(KycStatus), required: true, index: true })
  status!: KycStatusType;

  /** Tier the customer currently holds. Moved only by a decision (or expiry). */
  @Prop({ type: Number, min: 0, max: MAX_KYC_TIER, default: 0 })
  currentTier!: number;

  @Prop({ type: Number, min: 0, max: MAX_KYC_TIER, required: true })
  requestedTier!: number;

  @Prop({ type: [String], default: [] })
  completedSteps!: KycStep[];

  @Prop({ type: [KycCaseDocumentSchema], default: [] })
  documents!: KycAttachedDocument[];

  @Prop({ type: KycLivenessResultSchema, default: null })
  liveness!: KycLivenessResult | null;

  @Prop({ type: String, enum: Object.values(RiskRating), default: null })
  riskRating!: RiskRatingType | null;

  /** What the reviewer told the customer. The only free text the customer ever sees. */
  @Prop({ type: String, default: null })
  reviewerMessage!: string | null;

  /** The sealed personal answers. Ciphertext; see `kyc-pii.ts`. */
  @Prop({ type: String, default: '' })
  pii!: string;

  @Prop({ type: Date, default: null })
  submittedAt!: Date | null;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  /** When the approval lapses and the tier falls back to 0 pending re-KYC. */
  @Prop({ type: Date, default: null })
  expiresAt!: Date | null;

  /** Who decided: an admin id (`adm_…`) or the automated pass. */
  @Prop({ type: String, default: null })
  decidedBy!: string | null;

  /** Why the automated pass decided as it did, for the audit trail. */
  @Prop({ type: String, default: null })
  decisionReason!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type KycCaseDocument = HydratedDocument<KycCaseRecord>;

export const KycCaseSchema = SchemaFactory.createForClass(KycCaseRecord);

/** The queue an analyst works: oldest submission first, so no file rots at the back. */
KycCaseSchema.index({ status: 1, submittedAt: 1 });

/** The expiry sweep's lookup: approved cases whose validity has run out. */
KycCaseSchema.index({ status: 1, expiresAt: 1 });
