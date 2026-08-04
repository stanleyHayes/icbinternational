/**
 * Customer profile, onboarding and Know-Your-Customer.
 *
 * KYC is tiered: every tier unlocks higher limits and more products, and the tier is the
 * input the limits engine reads. A customer is never blocked outright for being at a low
 * tier — they are told which tier the action needs and how to get there.
 */

import { z } from 'zod';

import {
  countryCodeSchema,
  entityId,
  isoDateSchema,
  isoDateTimeSchema,
  mediumTextSchema,
  positiveMoneySchema,
  shortTextSchema,
} from '../common/primitives.js';

// --- Enums ----------------------------------------------------------------

/** Tier 0 receives money only; tier 3 is a fully verified customer with no cap. */
export const KycTier = { TIER_0: 0, TIER_1: 1, TIER_2: 2, TIER_3: 3 } as const;
export type KycTier = (typeof KycTier)[keyof typeof KycTier];

export const KycStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  MORE_INFO_REQUIRED: 'MORE_INFO_REQUIRED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const DocumentKind = {
  PASSPORT: 'PASSPORT',
  NATIONAL_ID: 'NATIONAL_ID',
  DRIVING_LICENCE: 'DRIVING_LICENCE',
  PROOF_OF_ADDRESS: 'PROOF_OF_ADDRESS',
  SELFIE: 'SELFIE',
  PAYSLIP: 'PAYSLIP',
  BANK_STATEMENT: 'BANK_STATEMENT',
  BUSINESS_REGISTRATION: 'BUSINESS_REGISTRATION',
  OTHER: 'OTHER',
} as const;
export type DocumentKind = (typeof DocumentKind)[keyof typeof DocumentKind];

export const RiskRating = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  PROHIBITED: 'PROHIBITED',
} as const;
export type RiskRating = (typeof RiskRating)[keyof typeof RiskRating];

export const EmploymentStatus = {
  EMPLOYED: 'EMPLOYED',
  SELF_EMPLOYED: 'SELF_EMPLOYED',
  STUDENT: 'STUDENT',
  RETIRED: 'RETIRED',
  UNEMPLOYED: 'UNEMPLOYED',
  OTHER: 'OTHER',
} as const;
export type EmploymentStatus = (typeof EmploymentStatus)[keyof typeof EmploymentStatus];

export const SourceOfFunds = {
  SALARY: 'SALARY',
  BUSINESS_INCOME: 'BUSINESS_INCOME',
  INVESTMENTS: 'INVESTMENTS',
  INHERITANCE: 'INHERITANCE',
  PROPERTY_SALE: 'PROPERTY_SALE',
  PENSION: 'PENSION',
  SAVINGS: 'SAVINGS',
  OTHER: 'OTHER',
} as const;
export type SourceOfFunds = (typeof SourceOfFunds)[keyof typeof SourceOfFunds];

// --- Value objects --------------------------------------------------------

export const addressSchema = z.object({
  line1: shortTextSchema,
  line2: shortTextSchema.optional(),
  city: shortTextSchema,
  region: shortTextSchema.optional(),
  postalCode: z.string().trim().min(2).max(16),
  country: countryCodeSchema,
});
export type Address = z.infer<typeof addressSchema>;

export const documentSchema = z.object({
  id: entityId('doc'),
  kind: z.enum(DocumentKind),
  fileName: shortTextSchema,
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  /** Short-lived signed URL. Never a public Cloudinary address for KYC material. */
  previewUrl: z.url().nullable(),
  uploadedAt: isoDateTimeSchema,
  verified: z.boolean(),
});
export type CustomerDocument = z.infer<typeof documentSchema>;

// --- Profile --------------------------------------------------------------

export const profileSchema = z.object({
  userId: entityId('usr'),
  dateOfBirth: isoDateSchema.nullable(),
  nationality: countryCodeSchema.nullable(),
  address: addressSchema.nullable(),
  employmentStatus: z.enum(EmploymentStatus).nullable(),
  occupation: shortTextSchema.nullable(),
  employerName: shortTextSchema.nullable(),
  annualIncome: positiveMoneySchema.nullable(),
  sourceOfFunds: z.enum(SourceOfFunds).nullable(),
  taxResidency: countryCodeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});
export type Profile = z.infer<typeof profileSchema>;

export const updateProfileRequestSchema = profileSchema
  .omit({ userId: true, updatedAt: true })
  .partial();
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

// --- KYC case -------------------------------------------------------------

export const kycStepSchema = z.enum([
  'IDENTITY',
  'ADDRESS',
  'EMPLOYMENT',
  'SOURCE_OF_FUNDS',
  'DOCUMENTS',
  'LIVENESS',
  'REVIEW',
]);
export type KycStep = z.infer<typeof kycStepSchema>;

export const kycCaseSchema = z.object({
  id: entityId('kyc'),
  userId: entityId('usr'),
  status: z.enum(KycStatus),
  currentTier: z.number().int().min(0).max(3),
  requestedTier: z.number().int().min(0).max(3),
  completedSteps: z.array(kycStepSchema),
  nextStep: kycStepSchema.nullable(),
  documents: z.array(documentSchema),
  riskRating: z.enum(RiskRating).nullable(),
  /** Free-text reason shown to the customer when more information is needed. */
  reviewerMessage: mediumTextSchema.nullable(),
  submittedAt: isoDateTimeSchema.nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type KycCase = z.infer<typeof kycCaseSchema>;

export const startKycRequestSchema = z.object({
  requestedTier: z.number().int().min(1).max(3).default(2),
});

export const submitKycStepRequestSchema = z.discriminatedUnion('step', [
  z.object({
    step: z.literal('IDENTITY'),
    dateOfBirth: isoDateSchema,
    nationality: countryCodeSchema,
  }),
  z.object({ step: z.literal('ADDRESS'), address: addressSchema }),
  z.object({
    step: z.literal('EMPLOYMENT'),
    employmentStatus: z.enum(EmploymentStatus),
    occupation: shortTextSchema.optional(),
    employerName: shortTextSchema.optional(),
    annualIncome: positiveMoneySchema.optional(),
  }),
  z.object({
    step: z.literal('SOURCE_OF_FUNDS'),
    sourceOfFunds: z.enum(SourceOfFunds),
    detail: mediumTextSchema.optional(),
  }),
  z.object({ step: z.literal('LIVENESS'), selfieDocumentId: entityId('doc') }),
]);
export type SubmitKycStepRequest = z.infer<typeof submitKycStepRequestSchema>;

export const uploadDocumentRequestSchema = z.object({
  kind: z.enum(DocumentKind),
  /** Cloudinary upload id returned by the signed-upload handshake. */
  assetId: z.string().min(1),
  fileName: shortTextSchema,
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
});
export type UploadDocumentRequest = z.infer<typeof uploadDocumentRequestSchema>;
