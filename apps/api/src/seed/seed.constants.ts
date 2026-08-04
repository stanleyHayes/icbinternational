/**
 * Names and shared values the foundation seed writes with.
 *
 * The collections below belong to feature modules that are still being built. The seed
 * populates them by natural key and never creates indexes or models for them — see the
 * note on `SeedWriter`. Any change to a name here must be matched in the owning module,
 * which is why they are declared once rather than typed out at each call site.
 */

/** Reference data for every currency the bank can hold, quote or settle in. */
export const CURRENCIES_COLLECTION = 'currencies';

/** Billers reachable through the simulated bill-payment rail. */
export const BILLERS_COLLECTION = 'billers';

/** Branches and ATMs shown on the public "find us" map. */
export const LOCATIONS_COLLECTION = 'locations';

/** Staff roles and the permission bundles they carry. */
export const ROLES_COLLECTION = 'roles';

/**
 * The date every foundation product version takes effect from.
 *
 * A fixed past date rather than "today": seeding twice on different days must produce
 * the same catalogue, and a product that took effect the moment it was seeded could not
 * price an account the persona generator backdates to last year.
 */
export const FOUNDATION_EFFECTIVE_FROM = '2020-01-01';

/** Country every seeded branch and ATM sits in. Reliance Bank is UK-licensed. */
export const SEED_COUNTRY = 'GB';

/** Currency the foundation catalogue is priced in. */
export const SEED_CURRENCY = 'GBP';
