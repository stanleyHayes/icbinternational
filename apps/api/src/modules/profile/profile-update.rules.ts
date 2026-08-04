/**
 * What a customer may change about themselves, when, and how to describe it back to them.
 *
 * Pure: the whole decision is `(patch, kyc status) → refusal | nothing`, which is the
 * shape you want to be able to test without a database or a container.
 *
 * Two refusals, and both exist because a profile field is not merely a preference —
 * several of them are inputs to a verification the bank has already performed and is
 * answerable for.
 */

import { ErrorCode, KycStatus, type Profile, type UpdateProfileRequest } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Fields the identity check was performed against.
 *
 * Once a case is approved these are what the document said, and a customer editing them
 * would silently detach the record from the evidence supporting it. Changing them is a job
 * for someone who can look at a document again.
 */
const VERIFIED_FIELDS: readonly string[] = Object.freeze(['dateOfBirth', 'nationality']);

/**
 * Fields a reviewer weighs when deciding a case.
 *
 * While a case is with a reviewer these must hold still. Letting an address or an income
 * figure move underneath an analyst means the decision is recorded against answers that no
 * longer exist — exactly the thing a regulator asks to see reconstructed.
 */
const REVIEWED_FIELDS: readonly string[] = Object.freeze([
  'dateOfBirth',
  'nationality',
  'address',
  'employmentStatus',
  'occupation',
  'employerName',
  'annualIncome',
  'sourceOfFunds',
]);

/** Statuses that mean an analyst currently owns the answers. */
const IN_REVIEW: readonly string[] = Object.freeze([KycStatus.SUBMITTED, KycStatus.UNDER_REVIEW]);

/**
 * Refuses a patch the customer is not free to make.
 *
 * @throws {AppError} `KYC_PENDING_REVIEW` while a reviewer holds the answers;
 *   `PRECONDITION_FAILED` for a field the identity check is anchored to.
 */
export function assertUpdatable(patch: UpdateProfileRequest, status: KycStatus): void {
  const touched = new Set(Object.keys(patch));

  if (IN_REVIEW.includes(status)) {
    const held = REVIEWED_FIELDS.filter((field) => touched.has(field));
    if (held.length > 0) throw underReview(held);
  }

  if (status === KycStatus.APPROVED) {
    const locked = VERIFIED_FIELDS.filter((field) => touched.has(field));
    if (locked.length > 0) throw verified(locked);
  }
}

/**
 * Which fields a patch would actually move.
 *
 * Compared against the assembled profile rather than the stored corrections, so re-saving
 * the address onboarding already knew reads as the no-op it is. The bank announces every
 * change to a customer's details, and announcing one that did not happen trains people to
 * ignore the message that matters.
 */
export function changedFields(current: Profile, patch: UpdateProfileRequest): string[] {
  // Widened to `unknown` for the same reason `definedOnly` is: under
  // `exactOptionalPropertyTypes` an absent optional field is absent rather than
  // `undefined`, so the analyser reads the filter as always true. It is not — a caller
  // spreading a partially-built object can still hand over an explicit `undefined`.
  const entries: readonly [string, unknown][] = Object.entries(patch);

  return entries
    .filter(([, value]) => value !== undefined)
    .filter(([field, value]) => !sameValue(readField(current, field), value))
    .map(([field]) => field);
}

/** "your address and your income" — an English list, because the customer reads it. */
export function describeFields(fields: readonly string[]): string {
  const labels = fields.map((field) => FIELD_LABEL[field] ?? field);
  const last = labels.at(-1) ?? '';
  if (labels.length <= 1) return last;
  return `${labels.slice(0, -1).join(', ')} and ${last}`;
}

function underReview(fields: readonly string[]): AppError {
  return new AppError({
    code: ErrorCode.KYC_PENDING_REVIEW,
    message:
      `We are still checking the details you gave us, so ${describeFields(fields)} cannot ` +
      'change just yet. We will let you know as soon as that is finished.',
    details: fields.map((field) => ({
      path: field,
      message: 'Locked while we check your details',
    })),
  });
}

function verified(fields: readonly string[]): AppError {
  return new AppError({
    code: ErrorCode.PRECONDITION_FAILED,
    message:
      `${capitalise(describeFields(fields))} is on the identity document we checked, so we ` +
      'cannot change it from here. Call us on 0800 019 4400 and we will put it right.',
    details: fields.map((field) => ({ path: field, message: 'Call us to change this' })),
  });
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Reads one field off an assembled profile without widening its type at the call site. */
function readField(profile: Profile, field: string): unknown {
  return (profile as unknown as Record<string, unknown>)[field];
}

/**
 * Structural comparison of two profile values.
 *
 * An address and a money amount are objects, so identity is the wrong test. JSON is exact
 * enough here because both are flat, key-ordered by the schema that validated them, and
 * hold nothing JSON cannot round-trip.
 */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Everyday names for the fields, because the customer reads them. */
const FIELD_LABEL: Readonly<Record<string, string>> = Object.freeze({
  dateOfBirth: 'your date of birth',
  nationality: 'your nationality',
  address: 'your address',
  employmentStatus: 'your employment status',
  occupation: 'your occupation',
  employerName: 'your employer',
  annualIncome: 'your income',
  sourceOfFunds: 'where your money comes from',
  taxResidency: 'where you pay tax',
});
