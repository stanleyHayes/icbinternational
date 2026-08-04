/**
 * The accounts module's public surface.
 *
 * Other lanes import from here, never from a file inside. Transfers need to resolve an
 * account and check who holds it; cards need the balance port; the holds module needs the
 * store and the re-bound `PostingService`. None of them has any business knowing how the
 * documents are shaped or which repository writes them.
 */

export { AccountsModule } from './accounts.module.js';

export {
  AccountService,
  accountNotFound,
  isHeldBy,
  type OwnedAccountRef,
} from './account.service.js';
export { AccountOpeningService } from './account-opening.service.js';
export { AccountStatusService } from './account-status.service.js';
export { AccountClosureService } from './account-closure.service.js';
export { NetWorthService } from './net-worth.service.js';
export {
  AccountNumberService,
  serialOf,
  type AccountIdentifiers,
} from './account-number.service.js';
export { AccountEligibilityService, type OpeningPlan } from './account-eligibility.service.js';
export { AccountFactory } from './account.factory.js';

export {
  AccountStore,
  type AccountPatchFields,
  type AccountPatchInput,
  type AccountQuery,
  type AccountRecord,
  type BalanceWriteInput,
  type ClearPrimaryInput,
  type DormancyQuery,
  type InsertAccountResult,
  type NewAccount,
  type UniqueAccountField,
} from './account.store.js';
export { AccountRepository } from './account.repository.js';
export { InMemoryAccountStore } from './in-memory-account.store.js';

export { computeAvailability, coversSpend, type AvailabilitySnapshot } from './availability.js';
export { assertAccountUsable } from './account-status.rules.js';
export { toContractAccount, toContractBalance, toIso } from './account.mapper.js';
export { BalanceWriteConflictError } from './concurrency.js';
export { MongoAccountBalancePort } from './mongo-account-balance.port.js';
export { ExchangeRatePort, IdentityExchangeRatePort } from './exchange-rate.port.js';

export {
  buildIban,
  domesticCheckDigits,
  hasValidDomesticCheck,
  ibanCheckDigits,
  isValidIban,
  mod97,
  normaliseIban,
} from './iban.js';

export {
  ACCOUNT_COLLECTION,
  ACCOUNT_MODEL,
  BANK_IDENTITY,
  DORMANCY_DAYS,
  MAX_OPEN_ACCOUNTS_PER_CUSTOMER,
  type BankIdentity,
} from './account.constants.js';
export { AccountSchema, AccountSchemaClass, type AccountDocument } from './account.schema.js';
