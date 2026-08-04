/**
 * Names and thresholds shared across the general-ledger module.
 *
 * The GL module reads the ledger's collections through its own model registrations —
 * the ledger module owns the `JournalEntry` and `LedgerAccount` model names, so
 * registering them here too would collide at boot when both modules are loaded. A model
 * name is a coupling point; these two are this module's.
 */

/** This module's read model over the ledger's `journal_entries` collection. */
export const GL_JOURNAL_READ_MODEL = 'GlJournalEntryRead';

/** This module's lifecycle model over the shared `chart_of_accounts` collection. */
export const GL_CHART_ACCOUNT_MODEL = 'GlChartAccount';

/** Reflector key under which `@RequireAdminPermission()` stores its permission. */
export const ADMIN_PERMISSION_KEY = 'gl:requiredAdminPermission';
