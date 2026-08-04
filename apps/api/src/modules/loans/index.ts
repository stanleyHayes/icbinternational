/**
 * The lending module's public surface.
 *
 * Other lanes import from here, never from a file inside. The overdraft, deposits and
 * savings-goals modules reuse the calendar arithmetic and the scorecard; the simulation
 * lane drives the arrears sweep; the admin app reads the arrears view. None of them has
 * any business knowing how a schedule is stored.
 */

export { LoansModule } from './loans.module.js';

export {
  annuityPayment,
  buildSchedule,
  compoundFactor,
  monthlyRate,
  principalForPayment,
  type AmortisationSchedule,
  type ScheduleRequest,
  type ScheduleRow,
} from './amortisation.js';

export {
  addDays,
  addMonths,
  addWeeks,
  daysBetween,
  fromIsoDate,
  isBefore,
  laterOf,
  monthsBetween,
  toIsoDate,
} from './calendar.js';

export {
  BPS_SCALE,
  DAYS_PER_YEAR,
  LOAN_TRANSACTION_LABEL,
  MAX_REPAYMENT_ATTEMPTS,
  MAX_TERM_MONTHS,
  MONTHS_PER_YEAR,
  RATE_SCALE,
} from './loan.constants.js';

export { creditScoreFor, debtToIncomeBps, type CreditProfile } from './credit-score.js';
export { assessEligibility, affordableAmount, indicativeAprBps } from './eligibility.js';
export {
  decide,
  LoanDecision,
  type DecisionOutcome,
  type DecisionRequest,
} from './decision-engine.js';
export { LOAN_PRODUCTS, REQUIRED_DOCUMENTS, findLoanProduct } from './loan-products.catalogue.js';

export {
  allocatePayment,
  allocatedTotal,
  type OutstandingAmounts,
  type PaymentAllocation,
} from './payment-allocation.js';
export { applyPayment, isSettled, outstandingBuckets, type RepaymentOutcome } from './repayment.js';
export {
  OverpaymentEffect,
  maturedPrincipal,
  rebuildTail,
  type RebuildRequest,
  type RebuiltSchedule,
} from './restructure.js';
export {
  accrueSinceLastInstalment,
  payoffFigures,
  remainingContractualTotal,
  scheduledFutureInterest,
  type PayoffFigures,
} from './payoff.js';

export {
  PROVISION_RATE_BPS,
  arrearsAmount,
  bucketForDays,
  daysPastDue,
  isLateFeeCharged,
  overdueInstalments,
  requiredProvision,
  unpaidPortion,
} from './arrears.js';

export { creditEntries } from './credit-entries.js';
export { LoanMovement, loanReference } from './loan-reference.js';

export { CreditProfileService, type DeclaredFinances } from './credit-profile.service.js';
export { LoanQuoteService } from './loan-quote.service.js';
export { LoanDecisionService } from './loan-decision.service.js';
export { LoanApplicationService } from './loan-application.service.js';
export { LoanDisbursementService, toScheduleRow } from './loan-disbursement.service.js';
export { LoanServicingService, loanNotFound } from './loan-servicing.service.js';
export { LoanRepaymentService, type RepayInput } from './loan-repayment.service.js';
export { newRepaymentAttemptId } from './repayment-attempt.js';
export { LoanSettlementService } from './loan-settlement.service.js';
export { LoanArrearsService, positionOf } from './loan-arrears.service.js';
export { LoanCollectionsService } from './loan-collections.service.js';
export { LoanLedgerService } from './loan-ledger.service.js';

export {
  LoanStore,
  type ArrearsSweepQuery,
  type ConditionalLoanPatch,
  type LoanExpectation,
  type LoanPatchFields,
  type LoanQuery,
  type LoanRecord,
  type NewLoan,
  type PaymentPlanRecord,
  type ScheduleRowRecord,
} from './loan.store.js';
export { InMemoryLoanStore } from './in-memory-loan.store.js';
export {
  LoanApplicationStore,
  type ApplicationClaim,
  type ExpiredOfferQuery,
  type LoanApplicationPatchFields,
  type LoanApplicationQuery,
  type LoanApplicationRecord,
  type NewLoanApplication,
} from './loan-application.store.js';
export { InMemoryLoanApplicationStore } from './in-memory-loan-application.store.js';

export {
  toContractLoan,
  toContractRow,
  toLoanQuote,
  toPayoffQuote,
  toQuoteRows,
} from './loan.mapper.js';
export { toContractApplication, outstandingDocuments } from './loan-application.mapper.js';
export { toArrearsView, type ArrearsView } from './loan-arrears.mapper.js';

export { DpdBucket, PaymentPlanStatus, type ArrearsPosition } from './loan.types.js';
export * from './loans.dto.js';
