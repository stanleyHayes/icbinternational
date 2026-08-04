/**
 * Client assembly.
 *
 * One transport, twenty-five resource groups over it. The groups share the transport
 * rather than each holding their own, which is what makes the single shared refresh
 * work: twelve concurrent 401s across six different groups still produce exactly one
 * refresh, because there is exactly one object holding the in-flight promise.
 */

import { resolveConfig, type ApiClientConfig, type ResolvedConfig } from './core/config.js';
import { HttpTransport } from './core/transport.js';
import { createAccountsResource } from './resources/accounts.js';
import { createAdminResource } from './resources/admin/index.js';
import { createAuthResource } from './resources/auth.js';
import { createBeneficiariesResource } from './resources/beneficiaries.js';
import { createBorrowResource } from './resources/borrow.js';
import { createBulkTransfersResource } from './resources/bulk-transfers.js';
import { createBusinessResource } from './resources/business.js';
import { createCardsResource } from './resources/cards.js';
import { createDevicesResource } from './resources/devices.js';
import { createFilesResource } from './resources/files.js';
import { createFxResource } from './resources/fx.js';
import { createInsightsResource } from './resources/insights.js';
import { createKycResource } from './resources/kyc.js';
import { createMfaResource } from './resources/mfa.js';
import { createNotificationsResource } from './resources/notifications.js';
import { createPaymentsResource } from './resources/payments.js';
import { createProfileResource } from './resources/profile.js';
import { createPublicResource } from './resources/public.js';
import { createSaveResource } from './resources/save.js';
import { createSimulationResource } from './resources/simulation.js';
import { createSupportResource } from './resources/support.js';
import { createSystemResource } from './resources/system.js';
import { createTransactionsResource } from './resources/transactions.js';
import { createTransferOrdersResource } from './resources/transfer-orders.js';
import { createTransfersResource } from './resources/transfers.js';

/** Groups that need the resolved config as well as the transport. */
function createConfiguredGroups(http: HttpTransport, config: ResolvedConfig) {
  return {
    notifications: createNotificationsResource(http, config),
    system: createSystemResource(http, config),
  };
}

/** Groups over the transport alone. */
function createTransportGroups(http: HttpTransport) {
  return {
    accounts: createAccountsResource(http),
    admin: createAdminResource(http),
    auth: createAuthResource(http),
    beneficiaries: createBeneficiariesResource(http),
    borrow: createBorrowResource(http),
    bulkTransfers: createBulkTransfersResource(http),
    business: createBusinessResource(http),
    cards: createCardsResource(http),
    devices: createDevicesResource(http),
    files: createFilesResource(http),
    fx: createFxResource(http),
    insights: createInsightsResource(http),
    kyc: createKycResource(http),
    mfa: createMfaResource(http),
    payments: createPaymentsResource(http),
    profile: createProfileResource(http),
    public: createPublicResource(http),
    save: createSaveResource(http),
    simulation: createSimulationResource(http),
    support: createSupportResource(http),
    transactions: createTransactionsResource(http),
    transferOrders: createTransferOrdersResource(http),
    transfers: createTransfersResource(http),
  };
}

/**
 * Creates a client.
 *
 * ```ts
 * const client = createApiClient({ baseUrl: 'https://api.reliance.bank' });
 * const { data: accounts } = await client.accounts.list();
 * ```
 *
 * Build one per application, not one per call: a client created inside a component is a
 * client whose refresh coordination is scoped to that component, which defeats it.
 */
export function createApiClient(config: ApiClientConfig = {}) {
  const resolved = resolveConfig(config);
  const http = new HttpTransport(resolved);

  return {
    ...createTransportGroups(http),
    ...createConfiguredGroups(http, resolved),

    /**
     * The transport itself, for calls the resource groups do not cover — a new endpoint
     * shipped ahead of this package, or a one-off in a test.
     */
    http,

    /** The resolved configuration, after defaults. */
    config: resolved,
  };
}

/** A configured client. */
export type ApiClient = ReturnType<typeof createApiClient>;
