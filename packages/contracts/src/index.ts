/**
 * `@reliance/contracts` — the frozen boundary between the API and everything that calls it.
 *
 * Every DTO, enum, Zod schema, error code and route path lives here. The API validates
 * inbound requests with these schemas; the three front ends validate their forms with the
 * same ones. One definition, three consumers — a field cannot drift out of agreement.
 *
 * This package is frozen after Phase 0. Changes go through the Contract Change Protocol
 * in `agent_plan.md` §4.3: additive where possible, and never without regenerating
 * `@reliance/api-client` and `@reliance/mocks` in the same commit.
 */

// --- Foundations ----------------------------------------------------------
export * from './common/error-codes.js';
export * from './common/primitives.js';
export * from './common/envelope.js';
export * from './common/routes.js';

// --- Identity & onboarding ------------------------------------------------
export * from './modules/auth.js';
export * from './modules/kyc.js';

// --- Core banking ---------------------------------------------------------
export * from './modules/accounts.js';
export * from './modules/ledger.js';
export * from './modules/transactions.js';
export * from './modules/statements.js';

// --- Money movement -------------------------------------------------------
export * from './modules/transfers.js';
export * from './modules/payments.js';
export * from './modules/fx.js';

// --- Products -------------------------------------------------------------
export * from './modules/cards.js';
export * from './modules/credit.js';
export * from './modules/products.js';

// --- Engagement -----------------------------------------------------------
export * from './modules/notifications.js';
export * from './modules/support.js';
export * from './modules/chat.js';
export * from './modules/content.js';

// --- Operations -----------------------------------------------------------
export * from './modules/admin.js';
export * from './modules/simulation.js';
