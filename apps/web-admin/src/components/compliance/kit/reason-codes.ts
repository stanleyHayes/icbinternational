/**
 * Why a decision went the way it did — from a fixed list, not from prose.
 *
 * "Declined" with no reason is what turns a compliance decision into a complaint, and
 * free text alone is not enough either: an analyst writing "docs no good" and another
 * writing "poor quality scan" have recorded the same fact in two forms nobody can count.
 * So a refusal carries a code the bank can report on **and** the sentence the customer
 * will be shown. Both are mandatory; the code alone is unfair and the prose alone is
 * unmeasurable.
 *
 * Every code here also carries the plain-English line the customer receives, so the
 * console cannot record one reason internally and send a different one out.
 */

import type { SelectOption } from '@reliance/ui';

/** One selectable reason, with the wording the customer is given. */
export interface ReasonCode {
  readonly code: string;
  /** What the analyst picks from the list. */
  readonly label: string;
  /** What the customer is told. Written to be read by the person it is about. */
  readonly customerWording: string;
}

/** Refusal reasons for an identity-verification decision. */
export const KYC_REJECTION_REASONS: readonly ReasonCode[] = [
  {
    code: 'DOCUMENT_ILLEGIBLE',
    label: 'Document could not be read',
    customerWording:
      'We could not read the document you sent us clearly enough to verify it. Please send a new photograph with all four corners visible and no glare.',
  },
  {
    code: 'DOCUMENT_EXPIRED',
    label: 'Document has expired',
    customerWording:
      'The identity document you sent us has expired. Please send a current one that has not passed its expiry date.',
  },
  {
    code: 'DETAILS_MISMATCH',
    label: 'Details do not match the application',
    customerWording:
      'The details on your document do not match the details on your application. Please check your name, date of birth and address and send them again.',
  },
  {
    code: 'ADDRESS_NOT_EVIDENCED',
    label: 'Address not evidenced',
    customerWording:
      'The proof of address you sent us is more than three months old or does not show your name and address together. Please send a recent bank statement or utility bill.',
  },
  {
    code: 'LIVENESS_FAILED',
    label: 'Selfie did not match the document',
    customerWording:
      'The photograph you took did not match the photograph on your identity document. Please try again in good light, facing the camera directly.',
  },
  {
    code: 'SUSPECTED_FORGERY',
    label: 'Document integrity in doubt',
    customerWording:
      'We are unable to verify your identity from the documents provided. Our team will contact you about what to send next.',
  },
  {
    code: 'SANCTIONS_MATCH',
    label: 'Confirmed sanctions or watchlist match',
    customerWording:
      'We are unable to open an account for you at this time. If you would like to discuss this, please contact us.',
  },
  {
    code: 'SOURCE_OF_FUNDS_UNCLEAR',
    label: 'Source of funds not evidenced',
    customerWording:
      'We need to understand where the money coming into your account will come from before we can complete your application. Please send recent payslips or business accounts.',
  },
  {
    code: 'PROHIBITED_JURISDICTION',
    label: 'Residency outside our licence',
    customerWording:
      'We are not able to offer accounts to residents of your country. This is a condition of our banking licence, not a decision about you.',
  },
  {
    code: 'CUSTOMER_UNRESPONSIVE',
    label: 'No response to our request',
    customerWording:
      'We asked for more information and have not heard back, so we have closed your application. You are welcome to apply again at any time.',
  },
];

/** What the bank is asking the customer to send when a case goes back to them. */
export const KYC_MORE_INFO_REASONS: readonly ReasonCode[] = [
  {
    code: 'NEED_CLEARER_DOCUMENT',
    label: 'A clearer photograph of the document',
    customerWording:
      'We need a clearer photograph of your identity document. Please make sure all four corners are visible and there is no glare across the page.',
  },
  {
    code: 'NEED_PROOF_OF_ADDRESS',
    label: 'A recent proof of address',
    customerWording:
      'We need a document from the last three months showing your name and current address — a bank statement, utility bill or council tax letter.',
  },
  {
    code: 'NEED_SOURCE_OF_FUNDS',
    label: 'Evidence of the source of funds',
    customerWording:
      'We need to see where the money paid into your account will come from. Recent payslips, business accounts or a letter from your accountant would all work.',
  },
  {
    code: 'NEED_SELFIE',
    label: 'A photograph of the customer',
    customerWording:
      'We need a photograph of you holding your identity document, so we can check it belongs to you.',
  },
  {
    code: 'NEED_EMPLOYMENT_DETAIL',
    label: 'Employment or occupation detail',
    customerWording:
      'We need a little more detail about your work — your occupation and who you work for.',
  },
];

/** Dispositions available when closing a sanctions, PEP or watchlist hit. */
export const SCREENING_DISPOSITION_REASONS: readonly ReasonCode[] = [
  {
    code: 'DIFFERENT_DATE_OF_BIRTH',
    label: 'Different date of birth',
    customerWording: 'Date of birth on the listed record does not match the customer.',
  },
  {
    code: 'DIFFERENT_NATIONALITY',
    label: 'Different nationality or country',
    customerWording: 'Nationality and country of residence rule out the listed person.',
  },
  {
    code: 'COMMON_NAME',
    label: 'Common name, no other identifiers',
    customerWording: 'Name match only, with no supporting identifier in common.',
  },
  {
    code: 'IDENTIFIERS_CONFIRMED',
    label: 'Identifiers confirm the match',
    customerWording: 'Date of birth and identity number both match the listed record.',
  },
  {
    code: 'REQUIRES_SENIOR_REVIEW',
    label: 'Needs a senior compliance decision',
    customerWording: 'Referred for a second opinion before the customer is affected.',
  },
];

/** Turns a reason list into options for a `Select`. */
export function reasonOptions(reasons: readonly ReasonCode[]): readonly SelectOption[] {
  return reasons.map((reason) => ({ value: reason.code, label: reason.label }));
}

/** Finds one reason by code. */
export function findReason(reasons: readonly ReasonCode[], code: string): ReasonCode | undefined {
  return reasons.find((reason) => reason.code === code);
}
