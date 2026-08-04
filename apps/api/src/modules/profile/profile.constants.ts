/**
 * Names, budgets and audit vocabulary for the profile lane.
 *
 * A model name couples the schema, the repository and the module registration; keeping
 * each literal in one place removes two chances for them to disagree.
 */

export const CUSTOMER_PROFILE_MODEL = 'CustomerProfile';
export const CUSTOMER_PROFILE_COLLECTION = 'customer_profiles';

export const DATA_EXPORT_MODEL = 'CustomerDataExport';
export const DATA_EXPORT_COLLECTION = 'customer_data_exports';

/**
 * How long a prepared subject-access copy stays claimable.
 *
 * It is the densest personal record the bank ever assembles about one person, so it is
 * given a life rather than kept indefinitely: thirty days is long enough for the customer
 * to collect it and short enough that a forgotten one stops existing.
 */
export const DATA_EXPORT_TTL_DAYS = 30;

/** What a subject-access copy is assembled from, in the order the sections are gathered. */
export const DATA_EXPORT_CATEGORIES: readonly string[] = Object.freeze([
  'IDENTITY',
  'PROFILE',
  'ONBOARDING',
  'ACCOUNTS',
  'CARDS',
  'LOANS',
  'DEPOSITS',
]);

/** Audit entity family for a change to the customer's own details. */
export const PROFILE_AUDIT_ENTITY = 'profile';

/** Audit entity family for something done to the relationship as a whole. */
export const CUSTOMER_AUDIT_ENTITY = 'customer';

/**
 * The fields the audit trail keeps on a profile change.
 *
 * A very short allow-list, deliberately. The trail records *that* a customer's details
 * changed and when — which is the fact an investigator needs and the fact an account
 * takeover would rather nobody had — never what they changed to. Those values are the
 * personal data this whole lane exists to keep sealed, and an audit row would be the one
 * place in the bank they sat in the clear.
 */
export const PROFILE_AUDIT_CAPTURE_FIELDS: readonly string[] = Object.freeze([
  'userId',
  'updatedAt',
]);

/** Locale used when rendering a date or an amount into something a customer reads. */
export const PROFILE_LOCALE = 'en-GB';
