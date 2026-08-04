/**
 * The deposits module's public surface.
 *
 * The simulation lane drives the maturity run; the marketing site renders the rate board.
 * Neither needs to know how a deposit is stored.
 */

export { DepositsModule } from './deposits.module.js';

export { BREAK_PENALTY_BPS, DEPOSIT_RATES, brokenRateBps, rateForTenor } from './deposit-rates.js';

export {
  accruedTo,
  breakFigures,
  interestAtMaturity,
  interestFor,
  type BreakFigures,
} from './deposit-interest.js';

export { depositEntries } from './deposit-entries.js';
export { DepositService } from './deposit.service.js';
export { DepositMaturityService } from './deposit-maturity.service.js';

export {
  DepositStore,
  type DepositPatchFields,
  type DepositQuery,
  type DepositRecord,
  type MaturityQuery,
  type NewDeposit,
} from './deposit.store.js';
export { InMemoryDepositStore } from './in-memory-deposit.store.js';

export { toBreakQuote, toContractDeposit } from './deposit.mapper.js';
export {
  DepositMovement,
  DEPOSIT_REFERENCE_PREFIX,
  DEPOSIT_TRANSACTION_LABEL,
  depositReference,
} from './deposit.types.js';
export * from './deposits.dto.js';
