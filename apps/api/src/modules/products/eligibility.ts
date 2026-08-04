import { ErrorCode, type Product } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { fromWire } from '../../common/money/money.codec.js';

/**
 * Eligibility rules: may this applicant open this product?
 *
 * Pure and total — every rule is evaluated even after one has failed, because the
 * answer a customer needs is "here is everything standing between you and this account",
 * not a single reason that changes each time they fix one. Being pure also lets the loan
 * and account-opening flows test their decision tables against a fixture matrix without
 * a database.
 */

/** The applicant facts the rules consult. */
export interface ApplicantSnapshot {
  /** Verified KYC tier, 0–3. */
  readonly kycTier: number;
  /** The balance the account would be opened with. */
  readonly openingBalance: Money;
}

/** One rule the applicant failed, in the contract's error vocabulary. */
export interface EligibilityDenial {
  readonly code: ErrorCode;
  readonly message: string;
}

/** The outcome of evaluating every rule. */
export interface EligibilityVerdict {
  readonly eligible: boolean;
  readonly denials: readonly EligibilityDenial[];
}

/** Evaluates all of a product's eligibility rules for an applicant. */
export function checkEligibility(
  product: Product,
  applicant: ApplicantSnapshot,
): EligibilityVerdict {
  const denials = [
    withdrawnDenial(product),
    kycTierDenial(product, applicant.kycTier),
    currencyDenial(product, applicant.openingBalance),
    openingBalanceDenial(product, applicant.openingBalance),
  ].filter(isPresent);

  return { eligible: denials.length === 0, denials };
}

/** A withdrawn product keeps serving existing accounts but takes no new ones. */
function withdrawnDenial(product: Product): EligibilityDenial | null {
  if (product.active) return null;

  return {
    code: ErrorCode.PRECONDITION_FAILED,
    message: `${product.name} is not open to new applications`,
  };
}

function kycTierDenial(product: Product, kycTier: number): EligibilityDenial | null {
  if (kycTier >= product.minKycTier) return null;

  return {
    code: ErrorCode.KYC_TIER_TOO_LOW,
    message: `${product.name} requires verification tier ${product.minKycTier}; the applicant is at tier ${kycTier}`,
  };
}

/** The opening deposit must be in a currency the product is sold in. */
function currencyDenial(product: Product, openingBalance: Money): EligibilityDenial | null {
  if (product.currencies.includes(openingBalance.currency)) return null;

  return {
    code: ErrorCode.CURRENCY_MISMATCH,
    message: `${product.name} is not offered in ${openingBalance.currency}`,
  };
}

/**
 * The opening deposit against the product's floor.
 *
 * Skipped when the currency itself is unsupported: comparing amounts across currencies
 * would throw, and the currency denial already says what is wrong.
 *
 * That guard was not enough on its own. A product offered in several currencies still
 * carries a single `minOpeningBalance`, denominated in the catalogue currency — and it
 * defaults to a *zero in GBP*. Opening an FX wallet in EUR therefore reached this
 * comparison with a supported currency on one side and GBP on the other, and threw a
 * `CurrencyMismatchError` out of an eligibility check that is supposed to answer yes or no.
 *
 * A zero minimum is nothing to enforce, whatever it is denominated in. A non-zero one in
 * another currency cannot be enforced here at all: converting it needs a rate, and this is
 * a pure function with no rate source. Comparing the numbers regardless would be worse
 * than skipping — it would apply a GBP threshold to a JPY amount and deny by a factor of
 * roughly two hundred. A multi-currency product that needs a real floor needs a
 * per-currency table, which the catalogue does not yet model.
 */
function openingBalanceDenial(product: Product, openingBalance: Money): EligibilityDenial | null {
  if (!product.currencies.includes(openingBalance.currency)) return null;

  const minimum = fromWire(product.minOpeningBalance);
  if (minimum.isZero) return null;
  if (minimum.currency !== openingBalance.currency) return null;
  if (openingBalance.greaterThanOrEqual(minimum)) return null;

  return {
    code: ErrorCode.AMOUNT_BELOW_MINIMUM,
    message: `${product.name} opens with at least ${minimum.format()}`,
  };
}

function isPresent(value: EligibilityDenial | null): value is EligibilityDenial {
  return value !== null;
}
