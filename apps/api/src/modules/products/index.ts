/**
 * The products module's public surface.
 *
 * Other feature modules import from here, never from a file inside. That keeps the
 * internal layout — where the pricing arithmetic lives, how counters are stored — free to
 * change without a cross-module edit.
 */

export { FeeService, type FeeRequest } from './fee.service.js';
export {
  computeFee,
  FeeWaiver,
  findFeeEntry,
  type FeeInput,
  type FeeQuote,
} from './fee-calculator.js';
export {
  checkEligibility,
  type ApplicantSnapshot,
  type EligibilityDenial,
  type EligibilityVerdict,
} from './eligibility.js';
export { annualCreditInterest, resolveCreditRateBps } from './interest-tiers.js';
export { LimitsService, type LimitQuery } from './limits.service.js';
export {
  LimitPeriod,
  LimitRule,
  LimitScope,
  matrixFor,
  toLimitUsage,
  toLimitUsages,
  type LimitBreach,
  type LimitWindowUsage,
} from './limit-calculator.js';
export { ProductService, type ProductVersionDraft } from './product.service.js';
export { ProductsModule } from './products.module.js';
export { dayWindow, monthWindow, assertTimeZone, type PeriodWindow } from './period-window.js';
export { DEFAULT_TIME_ZONE, PRODUCTS_COLLECTION } from './product.constants.js';
