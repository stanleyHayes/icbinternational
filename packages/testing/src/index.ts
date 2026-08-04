/**
 * `@reliance/testing` — the test harness for Reliance Bank.
 *
 * - **Seeded faker** — deterministic person/address/phone data, GB locale.
 * - **Builders** — fluent, contract-valid test data (`aUser()`, `anAccount()`, …).
 * - **Matchers** — `toEqualMoney()` and `toBalance()`; register via
 *   `@reliance/testing/jest.setup` in `setupFilesAfterEnv`.
 * - **Mongo harness** — one isolated database per suite on the local replica set.
 *
 * @example
 * import { anAccount, aMoney, MongoTestHarness } from '@reliance/testing';
 */

export { createSeededFaker, DEFAULT_TEST_SEED, testFaker } from './faker/seeded-faker.js';

export { Builder, DEFAULT_DATE, DEFAULT_INSTANT } from './builders/builder.js';
export { testId } from './builders/test-id.js';
export { aMoney, MoneyBuilder } from './builders/money.builder.js';
export { aBalance, BalanceBuilder } from './builders/balance.builder.js';
export { aUser, UserBuilder } from './builders/user.builder.js';
export { anAccount, AccountBuilder } from './builders/account.builder.js';
export { aJournalEntry, JournalEntryBuilder } from './builders/journal-entry.builder.js';

export { isMoneyLike, normaliseMoney, type MoneyLike } from './matchers/money-like.js';
export { toEqualMoney } from './matchers/to-equal-money.js';
export { toBalance, type PostingLike } from './matchers/to-balance.js';
export { relianceMatchers } from './matchers/register-matchers.js';

export {
  HarnessStateError,
  MongoTestHarness,
  type MongoHarnessOptions,
} from './mongo/mongo-test-harness.js';
