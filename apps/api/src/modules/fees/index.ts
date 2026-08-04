/**
 * The fees module's public surface.
 *
 * Other lanes import from here, never from a file inside. Cards report an ATM
 * withdrawal, transfers an international fee, fx a markup, loans a late payment — all
 * through `FeeChargingService.chargeEventFee`. Nobody outside the module builds charge
 * keys or touches the charge collection.
 */

export { FeesModule } from './fees.module.js';

export {
  FeeChargingService,
  type AssessFeeInput,
  type EventFeeInput,
} from './fee-charging.service.js';
export { FeePostingService, type FeeBookingInput } from './fee-posting.service.js';
export { MaintenanceFeeService, type MaintenanceSweepResult } from './maintenance-fee.service.js';
export {
  FeeReconciliationService,
  type FeeReconciliationLine,
  type FeeReconciliationReport,
} from './fee-reconciliation.service.js';

export {
  FeeChargeStore,
  type CurrencyTotal,
  type FeeChargeRecord,
  type NewFeeCharge,
} from './fee-charge.store.js';
export { CustomerTierPort, StandardTermsTierPort } from './customer-tier.port.js';

export {
  applyProRata,
  activeDaysWithin,
  monthPeriodBefore,
  monthPeriodOf,
  type MonthPeriod,
  type ProRata,
} from './maintenance-period.js';

export {
  CHARGEABLE_ACCOUNT_MODEL,
  FEE_CHARGE_COLLECTION,
  FEE_CHARGE_MODEL,
  FEE_JOURNAL_READ_MODEL,
  FEE_REFERENCE_PREFIX,
  FeeChargeSource,
  eventChargeKey,
  scheduledChargeKey,
} from './fees.constants.js';
