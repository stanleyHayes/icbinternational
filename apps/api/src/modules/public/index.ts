/**
 * Public surface of the… public surface.
 *
 * The calculators are exported because the lending lane needs to agree with them: a
 * marketing page quoting one monthly repayment and an application quoting another is the
 * defect this export exists to prevent.
 */

export { PublicModule } from './public.module.js';
export { RatesService } from './rates.service.js';
export { CalculatorService } from './calculators/calculator.service.js';

export { quoteLoan, type LoanQuote, type LoanQuoteInput } from './calculators/loan-calculator.js';
export {
  projectSavings,
  type SavingsProjection,
  type SavingsProjectionInput,
} from './calculators/savings-calculator.js';

export { LeadStore, LeadKind, type LeadRecord } from './leads/lead.store.js';
export { InMemoryLeadStore } from './leads/in-memory-lead.store.js';

export { PublicCache, PublicCacheInterceptor } from './public-cache.interceptor.js';
export { PublicRateLimitGuard, RateLimit } from './public-rate-limit.guard.js';

export { PublicContentController } from './public-content.controller.js';
export { PublicReferenceController } from './public-reference.controller.js';
export { PublicToolsController } from './public-tools.controller.js';

export { type FeeSchedule, type RateTable } from './public.dto.js';
