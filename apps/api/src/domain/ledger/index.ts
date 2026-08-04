/**
 * The ledger domain — framework-free and dependency-free by design.
 *
 * Nothing in this directory may import NestJS, Mongoose or anything from `modules/`. The
 * lint config enforces that. The payoff is that the rules governing money can be tested
 * exhaustively in milliseconds, with no database and no mocks.
 */
export * from './chart-of-accounts.js';
export * from './entry-builder.js';
export * from './journal-entry.js';
export * from './ledger.errors.js';
export * from './posting.js';
export * from './recipes/index.js';
