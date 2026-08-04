/**
 * Authentication, multi-factor enrolment, devices and sessions.
 *
 * Tokens never appear in a response body — the access and refresh tokens are set as
 * httpOnly cookies by the API, so a successful login returns the *user*, not a secret.
 * Anything a client can read here is safe to put in application state.
 */

import { z } from 'zod';

import {
  emailSchema,
  entityId,
  isoDateTimeSchema,
  localeSchema,
  otpSchema,
  passwordSchema,
  phoneSchema,
  shortTextSchema,
} from '../common/primitives.js';

// --- Enums ----------------------------------------------------------------

export const UserStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
  SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const MfaMethod = {
  TOTP: 'TOTP',
  SMS: 'SMS',
  PASSKEY: 'PASSKEY',
  RECOVERY_CODE: 'RECOVERY_CODE',
} as const;
export type MfaMethod = (typeof MfaMethod)[keyof typeof MfaMethod];

export const DeviceTrust = {
  UNKNOWN: 'UNKNOWN',
  RECOGNISED: 'RECOGNISED',
  TRUSTED: 'TRUSTED',
  BLOCKED: 'BLOCKED',
} as const;
export type DeviceTrust = (typeof DeviceTrust)[keyof typeof DeviceTrust];

export const CustomerSegment = {
  PERSONAL: 'PERSONAL',
  BUSINESS: 'BUSINESS',
} as const;
export type CustomerSegment = (typeof CustomerSegment)[keyof typeof CustomerSegment];

// --- Views ----------------------------------------------------------------

export const userSchema = z.object({
  id: entityId('usr'),
  email: emailSchema,
  emailVerified: z.boolean(),
  phone: phoneSchema.nullable(),
  phoneVerified: z.boolean(),
  firstName: shortTextSchema,
  lastName: shortTextSchema,
  status: z.enum(UserStatus),
  segment: z.enum(CustomerSegment),
  kycTier: z.number().int().min(0).max(3),
  mfaEnabled: z.boolean(),
  mfaMethods: z.array(z.enum(MfaMethod)),
  locale: localeSchema,
  baseCurrency: z.string().length(3),
  avatarUrl: z.url().nullable(),
  createdAt: isoDateTimeSchema,
  lastLoginAt: isoDateTimeSchema.nullable(),
});
export type User = z.infer<typeof userSchema>;

export const sessionSchema = z.object({
  id: entityId('ses'),
  current: z.boolean(),
  deviceLabel: shortTextSchema,
  ipAddress: z.string(),
  location: shortTextSchema.nullable(),
  userAgent: z.string(),
  createdAt: isoDateTimeSchema,
  lastSeenAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});
export type Session = z.infer<typeof sessionSchema>;

export const deviceSchema = z.object({
  id: entityId('dev'),
  label: shortTextSchema,
  platform: shortTextSchema,
  trust: z.enum(DeviceTrust),
  hasPasskey: z.boolean(),
  firstSeenAt: isoDateTimeSchema,
  lastSeenAt: isoDateTimeSchema,
});
export type Device = z.infer<typeof deviceSchema>;

// --- Requests -------------------------------------------------------------

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: shortTextSchema,
  lastName: shortTextSchema,
  phone: phoneSchema.optional(),
  segment: z.enum(CustomerSegment).default(CustomerSegment.PERSONAL),
  locale: localeSchema.default('en-GB'),
  acceptedTerms: z.literal(true, { error: 'the terms must be accepted' }),
  marketingOptIn: z.boolean().default(false),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  /** Stable per-browser fingerprint used for device recognition and risk scoring. */
  deviceFingerprint: z.string().min(8).max(128),
  rememberDevice: z.boolean().default(false),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Login answers with either a session or an MFA challenge. Modelling it as a discriminated
 * union means the client cannot forget to handle the challenge branch.
 */
export const loginResultSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('AUTHENTICATED'), user: userSchema }),
  z.object({
    outcome: z.literal('MFA_REQUIRED'),
    challengeId: z.string(),
    methods: z.array(z.enum(MfaMethod)).min(1),
    expiresAt: isoDateTimeSchema,
  }),
]);
export type LoginResult = z.infer<typeof loginResultSchema>;

export const mfaVerifyRequestSchema = z.object({
  challengeId: z.string(),
  method: z.enum(MfaMethod),
  code: z.string().min(6).max(32),
  rememberDevice: z.boolean().default(false),
});
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;

export const verifyEmailRequestSchema = z.object({ token: z.string().min(16) });

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(16),
  password: passwordSchema,
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const totpEnrolResponseSchema = z.object({
  data: z.object({
    secret: z.string(),
    otpauthUri: z.string(),
    qrCodeDataUri: z.string(),
  }),
});
export type TotpEnrolResponse = z.infer<typeof totpEnrolResponseSchema>;

export const totpConfirmRequestSchema = z.object({ code: otpSchema });

export const recoveryCodesResponseSchema = z.object({
  data: z.object({ codes: z.array(z.string()).length(10), generatedAt: isoDateTimeSchema }),
});

/** Re-authentication for a sensitive action. Valid for a short, server-defined window. */
export const stepUpRequestSchema = z.object({
  method: z.enum(MfaMethod),
  credential: z.string().min(4),
});
export type StepUpRequest = z.infer<typeof stepUpRequestSchema>;
