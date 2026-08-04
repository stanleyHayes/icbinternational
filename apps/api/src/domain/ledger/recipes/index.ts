import { movementEntries } from './movement-entries.js';
import { productEntries } from './product-entries.js';

/**
 * The complete catalogue of entry shapes the bank can book.
 *
 * Services call `entries.internalTransfer(...)`, never `new Posting(...)`. Restricting
 * the ledger to a finite, named vocabulary is what makes it possible to audit — and what
 * stops a new feature quietly inventing a fifth way to move a pound.
 */
export const entries = { ...movementEntries, ...productEntries } as const;

export { movementEntries, productEntries };
