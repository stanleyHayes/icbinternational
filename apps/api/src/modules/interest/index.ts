/**
 * The interest engine's public surface.
 *
 * Other lanes import from here, never from a file inside. The simulation control room
 * needs the job names and payload types to enqueue runs; the statements lane needs
 * `accruedToDate` and `capitalisedToDate` figures; tests everywhere need the in-memory
 * store and the pure arithmetic.
 */

export { InterestModule } from './interest.module.js';

export {
  AccrualStateStore,
  type AccrualStateRecord,
  type ApplyAccrualInput,
  type ApplyCapitalisationInput,
} from './accrual-state.store.js';
export { InMemoryAccrualStateStore } from './in-memory-accrual-state.store.js';

export {
  InterestAccrualService,
  AccrualOutcome,
  type AccrualRunResult,
} from './interest-accrual.service.js';
export {
  InterestCapitalisationService,
  CapitalisationOutcome,
  type CapitalisationAccountResult,
  type CapitalisationRunResult,
} from './interest-capitalisation.service.js';

export {
  InterestAccountSource,
  type AccrualPageQuery,
  type InterestBearingAccount,
} from './interest-account.source.js';
export { InterestTermsSource } from './interest-terms.source.js';

export {
  DayCountConvention,
  HOUSE_DAY_COUNT,
  ACCRUAL_DENOMINATOR,
  accrualDenominator,
} from './day-count.js';
export {
  dailyAccrualUnits,
  splitCapitalisation,
  type CapitalisationSplit,
} from './accrual-math.js';
export {
  PERIOD_PATTERN,
  assertValidPeriod,
  lastDayOfPeriod,
  periodOf,
  previousPeriod,
} from './interest-calendar.js';

export {
  ACCRUAL_STATE_COLLECTION,
  ACCRUAL_STATE_MODEL,
  DAILY_ACCRUAL_JOB,
  INTEREST_ACCOUNT_VIEW_MODEL,
  INTEREST_REFERENCE_PREFIX,
  MONTHLY_CAPITALISATION_JOB,
} from './interest.constants.js';
