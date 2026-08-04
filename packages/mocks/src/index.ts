/**
 * `@reliance/mocks` — a stateful mock of the Reliance Bank API.
 *
 * Every route in the contract's `routes` map has a handler, and a test asserts that,
 * so the mocks cannot silently drift from the contract.
 *
 * The mocks are **stateful and coherent**, which is the property that makes them worth
 * having. A transfer created through the mock API debits the source account, appears at
 * the top of the transaction feed, and raises a notification — all in one call. A mock
 * that returned fresh random data on every request would be worse than no mock at all,
 * because it teaches the UI that the bank's own numbers need not agree with each other.
 *
 * ```ts
 * // Browser
 * const { browserWorker } = await import('@reliance/mocks/browser');
 * await browserWorker.start({ onUnhandledRequest: 'bypass' });
 *
 * // Node / Jest
 * import { server } from '@reliance/mocks/server';
 * import { resetMockDatabase } from '@reliance/mocks';
 * beforeEach(() => resetMockDatabase());
 * ```
 *
 * Fixtures are seeded: `resetMockDatabase(1234)` reproduces the same bank every time,
 * so a screenshot test compares like with like.
 */

export { handlers, toMswHandlers } from './msw-adapter.js';

export { currentMockSeed, db, mockClock, resetMockDatabase } from './db/database.js';

export { MockClock, MOCK_EPOCH_MS } from './db/clock.js';
export type { MockDatabase, MockFraudReport } from './db/types.js';

export {
  absMoney,
  addMoney,
  applyBps,
  BASE_CURRENCY,
  compareMoney,
  isNegative,
  minorUnits,
  money,
  negateMoney,
  subtractMoney,
  sumMoney,
  zero,
} from './db/money.js';

export {
  findAccount,
  hasInsufficientFunds,
  notify,
  postToAccount,
  type PostingInput,
} from './db/ledger.js';

export {
  DEFAULT_SEED,
  faker,
  mockId,
  opaqueId,
  pickEnum,
  pickOne,
  reseed,
  times,
} from './faker.js';

// --- Factories ------------------------------------------------------------

export * from './factories/banking.js';
export * from './factories/engagement.js';
export * from './factories/identity.js';
export * from './factories/movement.js';
export * from './factories/operations.js';
export * from './factories/products.js';

// --- Handlers -------------------------------------------------------------

export { mockRoutes } from './handlers/index.js';
export {
  acknowledged,
  failure,
  MockMethod,
  notFound,
  pattern,
  raw,
  resourceCreated,
  resourceOk,
  route,
  Status,
  type MockContext,
  type MockResolver,
  type MockResult,
  type MockRoute,
} from './handlers/kit.js';
export { extractParams, matchPath } from './handlers/match.js';
export { decodeCursor, encodeCursor, paginate, paginateStatic } from './handlers/paging.js';
