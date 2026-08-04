/**
 * Constants shared by the limits engine, its override store and its admin surface.
 *
 * Collection names live here rather than in the schema file, matching the convention the
 * products module set: two spellings of one collection name are two collections that both
 * look right in isolation.
 */

/** Collection holding staff-granted limit overrides. Overrides are never deleted. */
export const LIMIT_OVERRIDES_COLLECTION = 'limit_overrides';

/**
 * Public id prefix for an override, e.g. `ovl_01J…`.
 *
 * Contracts' `ID_PREFIX` has no entry for a limit override yet; minting with the same
 * three-letter shape keeps the id valid against `PREFIXED_ID_PATTERN`. A contract change
 * adding `limitOverride: 'ovl'` is proposed so `IdGenerator` can own this.
 */
export const OVERRIDE_ID_PREFIX = 'ovl';

/**
 * Channel marker stored on an override that applies to every channel of its scope.
 *
 * A channel-specific override (`ATM`, `ONLINE`, …) outranks it for the caps it sets.
 */
export const ANY_CHANNEL = 'ANY';

/**
 * Longest life an override may have.
 *
 * An override is a deviation from the customer's agreed terms; one that never expires is
 * a permanent re-pricing that bypassed the product catalogue. Ninety days covers a
 * complaint or a temporary arrangement, and renewal is a deliberate act with its own
 * audit event.
 */
export const MAX_OVERRIDE_DAYS = 90;

/** Audit entity family for every event the admin controller emits. */
export const AUDIT_ENTITY = 'limit_override';

/**
 * Admin routes. The contract route map has no limits paths yet; these are proposed as
 * additions. Declared as module-level constants because decorator arguments are evaluated
 * when the class is defined.
 */
export const ADMIN_OVERRIDES_ROUTE = '/admin/limits/overrides';
export const ADMIN_OVERRIDE_ROUTE = `${ADMIN_OVERRIDES_ROUTE}/:id`;

/** Path parameter name, spelled once so the route constant and the decorator agree. */
export const OVERRIDE_ID_PARAM = 'id';
