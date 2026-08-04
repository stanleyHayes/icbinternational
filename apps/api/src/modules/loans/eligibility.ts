/**
 * Eligibility: what the bank will lend this customer, and at what price.
 *
 * A pure function of a product, a profile and a request. Nothing here reads a clock, a
 * database or a random number, which is what lets the whole matrix of income, tenure,
 * arrears history and identity tier be enumerated in a unit test rather than sampled.
 *
 * Three questions are answered together because they are the same question: affordability
 * sets the ceiling, the scorecard sets the price, and the product's own rules decide
 * whether the request fits inside either.
 */

import { type LoanEligibility, type LoanProduct } from '@reliance/contracts';
import { Money, RoundingMode } from '@reliance/money';

import { fromWire } from '../../common/money/money.codec.js';

import { principalForPayment } from './amortisation.js';
import { creditScoreFor, debtToIncomeBps, type CreditProfile } from './credit-score.js';
import {
  BPS_SCALE,
  MAXIMUM_DEBT_TO_INCOME_BPS,
  MAX_INSTALMENT_SHARE_BPS,
  MINIMUM_LENDABLE_SCORE,
} from './loan.constants.js';

/** Everything the assessment needs. */
export interface EligibilityRequest {
  readonly product: LoanProduct;
  readonly profile: CreditProfile;
  readonly requestedAmount: Money;
  readonly termMonths: number;
}

/**
 * How the risk-priced range is split by score.
 *
 * `weightBps` is how far up the product's own min-to-max APR corridor the customer lands:
 * 0 is the headline rate, 10 000 is the ceiling. Expressing it as a weight rather than as
 * absolute rates means a product can be repriced in the catalogue without touching the
 * scorecard.
 */
const PRICING_BANDS: readonly { atLeast: number; weightBps: bigint }[] = [
  { atLeast: 780, weightBps: 0n },
  { atLeast: 720, weightBps: 1500n },
  { atLeast: 680, weightBps: 3500n },
  { atLeast: 640, weightBps: 5500n },
  { atLeast: 600, weightBps: 7500n },
  { atLeast: 0, weightBps: 10_000n },
];

/** Copy the customer sees. Reasons are written to be read, not parsed. */
const REASON = {
  AFFORDABLE: 'Based on the income and commitments on file, this borrowing is affordable.',
  SCORE_TOO_LOW:
    'Your credit profile does not currently meet the standard we lend at. Reducing other ' +
    'commitments or building a longer history with us will improve it.',
  DEBT_TOO_HIGH:
    'Your existing monthly commitments already take up too much of your income for us to ' +
    'lend responsibly.',
  KYC_TIER:
    'This product needs a fully verified identity. Complete verification in your profile ' +
    'and you can apply straight away.',
  ABOVE_AFFORDABILITY: 'The amount requested is more than we can lend against your current income.',
  BELOW_MINIMUM: 'The amount requested is below the minimum for this product.',
  ABOVE_PRODUCT_MAXIMUM: 'The amount requested is above the maximum for this product.',
  TERM_OUT_OF_RANGE: 'The repayment term requested is outside the range for this product.',
  DEFAULT_HISTORY:
    'There is a default recorded against you. We can look at this again once it is more ' +
    'than six years old, or you can speak to our lending team.',
} as const;

/**
 * Assesses one request.
 *
 * `maxAmount` is always populated, even on a decline: telling a customer what they *could*
 * borrow is more useful than telling them only that the figure they typed was too big, and
 * it is what lets the application form suggest a workable amount instead of a dead end.
 */
export function assessEligibility(request: EligibilityRequest): LoanEligibility {
  const creditScore = creditScoreFor(request.profile);
  const dtiBps = debtToIncomeBps(request.profile);
  const maxAmount = affordableAmount(request, creditScore);
  const reasons = collectReasons({ request, creditScore, dtiBps, maxAmount });

  return {
    eligible: reasons.length === 0,
    maxAmount: maxAmount.toJSON(),
    indicativeAprBps: reasons.length === 0 ? indicativeAprBps(request.product, creditScore) : null,
    creditScore,
    debtToIncomeBps: dtiBps,
    reasons: reasons.length === 0 ? [REASON.AFFORDABLE] : reasons,
  };
}

/**
 * The customer's price inside the product's corridor.
 *
 * Interpolation is integer arithmetic on basis points throughout, so the quoted rate is
 * exactly reproducible from the score — a customer who asks why they were offered 11.49%
 * can be given an answer that does not involve a floating-point value.
 */
export function indicativeAprBps(product: LoanProduct, creditScore: number): number {
  const weightBps =
    PRICING_BANDS.find((band) => creditScore >= band.atLeast)?.weightBps ?? BPS_SCALE;
  const corridor = BigInt(product.maxAprBps - product.minAprBps);

  return product.minAprBps + Number((corridor * weightBps) / BPS_SCALE);
}

/**
 * The largest advance whose instalment fits inside the customer's disposable income.
 *
 * Disposable income is income less what other lenders already take; the bank will let a
 * new instalment consume {@link MAX_INSTALMENT_SHARE_BPS} of what is left. The result is
 * capped by the product's own maximum, because affordability is a ceiling on lending, not
 * a licence to exceed the product.
 */
export function affordableAmount(request: EligibilityRequest, creditScore: number): Money {
  const productMaximum = fromWire(request.product.maxAmount);
  const income = request.profile.monthlyIncome;
  const disposable = income.minus(request.profile.monthlyDebtPayments);

  if (!disposable.isPositive) return Money.zero(productMaximum.currency);

  const maxPayment = disposable.scaleByRatio(
    MAX_INSTALMENT_SHARE_BPS,
    BPS_SCALE,
    RoundingMode.DOWN,
  );
  const affordable = principalForPayment({
    maxPayment,
    aprBps: indicativeAprBps(request.product, creditScore),
    termMonths: clampTerm(request),
  });

  return affordable.lessThan(productMaximum) ? affordable : productMaximum;
}

function collectReasons(input: {
  request: EligibilityRequest;
  creditScore: number;
  dtiBps: number;
  maxAmount: Money;
}): string[] {
  const { request, creditScore, dtiBps, maxAmount } = input;
  const { product, profile, requestedAmount, termMonths } = request;

  const reasons: string[] = [];
  if (profile.kycTier < product.minKycTier) reasons.push(REASON.KYC_TIER);
  if (profile.hasDefaultHistory) reasons.push(REASON.DEFAULT_HISTORY);
  if (creditScore < MINIMUM_LENDABLE_SCORE) reasons.push(REASON.SCORE_TOO_LOW);
  if (dtiBps > MAXIMUM_DEBT_TO_INCOME_BPS) reasons.push(REASON.DEBT_TOO_HIGH);
  if (requestedAmount.lessThan(fromWire(product.minAmount))) reasons.push(REASON.BELOW_MINIMUM);
  if (requestedAmount.greaterThan(fromWire(product.maxAmount))) {
    reasons.push(REASON.ABOVE_PRODUCT_MAXIMUM);
  }
  if (requestedAmount.greaterThan(maxAmount)) reasons.push(REASON.ABOVE_AFFORDABILITY);
  if (termMonths < product.minTermMonths || termMonths > product.maxTermMonths) {
    reasons.push(REASON.TERM_OUT_OF_RANGE);
  }

  return reasons;
}

/**
 * The term the affordability ceiling is computed over.
 *
 * A request outside the product's range is still assessed — the customer needs to be told
 * what they could borrow — so the term is pulled back inside the product's own bounds
 * rather than being used to build an impossible schedule.
 */
function clampTerm(request: EligibilityRequest): number {
  const { product, termMonths } = request;
  return Math.min(Math.max(termMonths, product.minTermMonths), product.maxTermMonths);
}
