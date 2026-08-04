/**
 * The decision engine: approve, refer or decline.
 *
 * Three outcomes rather than two, because a bank that can only say yes or no either lends
 * to people it should have looked at properly or turns away good business at the margin.
 * Referral is the honest answer for an application that is neither clearly safe nor
 * clearly unaffordable, and it is the only outcome that puts a human in the loop.
 *
 * Pure, and separate from {@link assessEligibility} on purpose: eligibility says what is
 * true about the customer, policy says what the bank does about it. Policy changes far
 * more often, and when it does, the arithmetic underneath must not have to be re-tested.
 */

import { LoanApplicationStatus, type LoanEligibility, type LoanProduct } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { fromWire } from '../../common/money/money.codec.js';

import {
  AUTO_APPROVE_SCORE,
  MAXIMUM_DEBT_TO_INCOME_BPS,
  MINIMUM_LENDABLE_SCORE,
  REFERRAL_DEBT_TO_INCOME_BPS,
} from './loan.constants.js';

/** What the engine decided. */
export const LoanDecision = {
  APPROVE: 'APPROVE',
  REFER: 'REFER',
  DECLINE: 'DECLINE',
} as const;
export type LoanDecision = (typeof LoanDecision)[keyof typeof LoanDecision];

/** The decision, the amount it applies to, and why. */
export interface DecisionOutcome {
  readonly decision: LoanDecision;
  /** What the bank will actually advance — never more than was asked for. */
  readonly approvedAmount: Money;
  readonly reasons: readonly string[];
  /** The application status this outcome puts the case into. */
  readonly status: LoanApplicationStatus;
}

/** What the engine is given. */
export interface DecisionRequest {
  readonly product: LoanProduct;
  readonly eligibility: LoanEligibility;
  readonly requestedAmount: Money;
  /** Documents the applicant still has to supply. A referral, never a decline. */
  readonly outstandingDocumentKinds: readonly string[];
}

const REASON = {
  APPROVED: 'Approved on the income, commitments and credit history on file.',
  MANUAL_REVIEW:
    'One of our underwriters is reviewing this application. We will be in touch within ' +
    'two working days.',
  DOCUMENTS_OUTSTANDING:
    'We still need a few documents before we can make a decision. Upload them and the ' +
    'application will move on automatically.',
  LARGE_ADVANCE:
    'Advances of this size are always reviewed by an underwriter before they are agreed.',
  DECLINED_AFFORDABILITY:
    'We are not able to lend this amount. The repayments would take up more of your ' +
    'income than we consider affordable.',
  DECLINED_PROFILE:
    'We are not able to offer this loan based on the information available to us. You ' +
    'can ask us for the reasons in writing, free of charge.',
} as const;

/**
 * Advances at or above this share of the product maximum always see a human.
 *
 * A concentration control rather than a credit one: the scorecard is calibrated on the
 * bulk of the book, and the largest advances are precisely the ones where being wrong is
 * expensive enough to be worth a second pair of eyes.
 */
const MANUAL_REVIEW_SHARE_BPS = 8000n;
const BPS = 10_000n;

/**
 * Decides an application.
 *
 * Declines are checked before referrals: an application that fails a hard rule is not
 * improved by an underwriter looking at it, and sending it to one would waste the
 * customer's time as well as the bank's.
 */
export function decide(request: DecisionRequest): DecisionOutcome {
  const approvedAmount = cappedAmount(request);

  const declineReasons = hardDeclines(request);
  if (declineReasons.length > 0) {
    return outcome(LoanDecision.DECLINE, approvedAmount, declineReasons);
  }

  const referralReasons = referrals(request, approvedAmount);
  if (referralReasons.length > 0) {
    return outcome(LoanDecision.REFER, approvedAmount, referralReasons);
  }

  return outcome(LoanDecision.APPROVE, approvedAmount, [REASON.APPROVED]);
}

const STATUS_FOR_DECISION: Readonly<Record<LoanDecision, LoanApplicationStatus>> = Object.freeze({
  [LoanDecision.APPROVE]: LoanApplicationStatus.APPROVED,
  [LoanDecision.REFER]: LoanApplicationStatus.REFERRED,
  [LoanDecision.DECLINE]: LoanApplicationStatus.DECLINED,
});

function outcome(
  decision: LoanDecision,
  approvedAmount: Money,
  reasons: readonly string[],
): DecisionOutcome {
  return { decision, approvedAmount, reasons, status: STATUS_FOR_DECISION[decision] };
}

function hardDeclines(request: DecisionRequest): string[] {
  const { eligibility } = request;
  const reasons: string[] = [];

  if (eligibility.creditScore < MINIMUM_LENDABLE_SCORE) reasons.push(REASON.DECLINED_PROFILE);
  if (eligibility.debtToIncomeBps > MAXIMUM_DEBT_TO_INCOME_BPS) {
    reasons.push(REASON.DECLINED_AFFORDABILITY);
  }
  if (!fromWire(eligibility.maxAmount).isPositive) reasons.push(REASON.DECLINED_AFFORDABILITY);

  return reasons;
}

function referrals(request: DecisionRequest, approvedAmount: Money): string[] {
  const { eligibility, product, outstandingDocumentKinds } = request;
  const reasons: string[] = [];

  if (outstandingDocumentKinds.length > 0) reasons.push(REASON.DOCUMENTS_OUTSTANDING);
  if (eligibility.creditScore < AUTO_APPROVE_SCORE) reasons.push(REASON.MANUAL_REVIEW);
  if (eligibility.debtToIncomeBps > REFERRAL_DEBT_TO_INCOME_BPS) reasons.push(REASON.MANUAL_REVIEW);
  if (isLargeAdvance(product, approvedAmount)) reasons.push(REASON.LARGE_ADVANCE);

  return [...new Set(reasons)];
}

function isLargeAdvance(product: LoanProduct, amount: Money): boolean {
  const threshold = fromWire(product.maxAmount).scaleByRatio(MANUAL_REVIEW_SHARE_BPS, BPS);
  return amount.greaterThanOrEqual(threshold);
}

/** Never offer more than was asked for, and never more than affordability allows. */
function cappedAmount(request: DecisionRequest): Money {
  const affordable = fromWire(request.eligibility.maxAmount);
  return request.requestedAmount.lessThan(affordable) ? request.requestedAmount : affordable;
}
