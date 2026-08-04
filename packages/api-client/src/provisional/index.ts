/**
 * Schemas for routes the frozen contract declares but does not describe.
 *
 * Re-exported from the client's public API so `@reliance/mocks` generates against the
 * very same objects the client validates against. Two copies of a shape is how mocks
 * start lying. See `./README.md` and `docs/CONTRACT_CHANGES.md`.
 */

export * from './documents.js';
export * from './business.js';
export * from './operations.js';
