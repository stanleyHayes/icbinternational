/**
 * The registry: every mock route, in match order.
 *
 * Order is load-bearing. MSW takes the first handler whose pattern matches, so a static
 * path must be registered before the parameterised path that would swallow it —
 * `/accounts/net-worth` before `/accounts/:id`, `/deposits/rates` before `/deposits/:id`.
 * Each group's module keeps its own static-first ordering internally; this file only has
 * to keep the groups apart.
 *
 * The route-coverage test walks this array and asserts that every path in the contract's
 * `routes` map resolves to a handler. If you add a route to the contract and not here,
 * that test fails — which is exactly the drift it exists to catch.
 */

import { accountHandlers, transactionHandlers } from './accounts.js';
import { adminCustomerHandlers } from './admin-customers.js';
import { adminFinanceHandlers } from './admin-finance.js';
import { adminPlatformHandlers } from './admin-platform.js';
import { adminRiskHandlers } from './admin-risk.js';
import { authHandlers } from './auth.js';
import { borrowHandlers } from './borrow.js';
import { businessHandlers } from './business.js';
import { cardHandlers } from './cards.js';
import { notificationHandlers, supportHandlers } from './engagement.js';
import { fxHandlers } from './fx.js';
import type { MockRoute } from './kit.js';
import { paymentHandlers } from './payments.js';
import { publicHandlers, systemHandlers } from './public.js';
import { saveHandlers } from './save.js';
import { fileHandlers, kycHandlers, securityHandlers } from './security.js';
import { simulationHandlers } from './simulation.js';
import { beneficiaryHandlers, transferHandlers, transferOrderHandlers } from './transfers.js';

/**
 * Every mock route.
 *
 * Simulation comes before the rest of admin because its paths live under
 * `/admin/simulation/...`, and an admin catch-all added later must not shadow them.
 */
export const mockRoutes: readonly MockRoute[] = [
  ...authHandlers,
  ...securityHandlers,
  ...kycHandlers,
  ...fileHandlers,
  ...accountHandlers,
  ...transactionHandlers,
  ...transferHandlers,
  ...beneficiaryHandlers,
  ...transferOrderHandlers,
  ...paymentHandlers,
  ...cardHandlers,
  ...saveHandlers,
  ...borrowHandlers,
  ...fxHandlers,
  ...notificationHandlers,
  ...supportHandlers,
  ...businessHandlers,
  ...publicHandlers,
  ...simulationHandlers,
  ...adminCustomerHandlers,
  ...adminFinanceHandlers,
  ...adminRiskHandlers,
  ...adminPlatformHandlers,
  ...systemHandlers,
];

export * from './kit.js';
export * from './match.js';
export * from './paging.js';
export { readMoney } from './read-body.js';
