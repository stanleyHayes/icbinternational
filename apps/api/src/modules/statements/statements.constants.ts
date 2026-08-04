/**
 * Retention, link life and the vocabulary the statement and letter routes share.
 *
 * Kept in one file so the archive depth quoted to the customer on the statements screen
 * and the depth this module will actually produce cannot drift apart.
 */

/** Statements the bank keeps and will reproduce on demand. */
export const STATEMENT_RETENTION_YEARS = 6;

const MONTHS_PER_YEAR = 12;

/** Upper bound on how far back the monthly archive is enumerated. */
export const STATEMENT_ARCHIVE_MONTHS = STATEMENT_RETENTION_YEARS * MONTHS_PER_YEAR;

/**
 * Life of a download signature, in seconds.
 *
 * Longer than the five minutes the file register signs its own links for. A statement
 * link is minted when the archive is listed and spent when the customer gets round to
 * clicking a row, which is a different span of attention from an upload handshake.
 */
export const DOWNLOAD_LINK_TTL_SECONDS = 900;

/** Widest ad-hoc range the bank will render in one document. */
export const MAX_STATEMENT_DAYS = 366;

/** Trailing path segment that serves the rendered artefact rather than its metadata. */
export const DOCUMENT_SEGMENT = 'document';

/** Query parameters carried by a signed download link. */
export const SIGNATURE_PARAM = 'signature';
export const EXPIRES_PARAM = 'expires';

/** Prefix for letter identifiers. Letters have no entry in the contract's `ID_PREFIX`. */
export const LETTER_ID_PREFIX = 'ltr';

/** How long a letter's own statement of fact is treated as current, in days. */
export const LETTER_VALIDITY_DAYS = 30;
