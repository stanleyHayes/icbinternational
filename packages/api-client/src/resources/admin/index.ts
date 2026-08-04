/**
 * The `client.admin` group.
 *
 * The contract's `routes.admin` holds fifty-six routes, which is far too many for one
 * file under the repo's size budget. They are split by the console screen that uses
 * them — customers, finance, risk, platform — and flattened back into a single object
 * here, so a caller still writes `client.admin.trialBalance()` and never has to know
 * which file it came from.
 */

import type { HttpTransport } from '../../core/transport.js';

import { createAdminCustomersResource } from './customers.js';
import { createAdminFinanceResource } from './finance.js';
import { createAdminPlatformResource } from './platform.js';
import { createAdminRiskResource } from './risk.js';

/** Builds the `client.admin` group. */
export function createAdminResource(http: HttpTransport) {
  return {
    ...createAdminCustomersResource(http),
    ...createAdminFinanceResource(http),
    ...createAdminRiskResource(http),
    ...createAdminPlatformResource(http),
  };
}

/** The `client.admin` group. */
export type AdminResource = ReturnType<typeof createAdminResource>;

export * from './customers.js';
export * from './finance.js';
export * from './platform.js';
export * from './risk.js';
