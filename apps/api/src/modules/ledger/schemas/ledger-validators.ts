import { Logger } from '@nestjs/common';
import { type Connection } from 'mongoose';

import {
  GL_CODE_PATTERN,
  JOURNAL_ENTRY_COLLECTION,
  LEDGER_ACCOUNT_COLLECTION,
} from '../ledger.constants.js';

import { JOURNAL_ENTRY_VALIDATOR } from './journal-entry.schema.js';

/**
 * Server-side `$jsonSchema` validation for the ledger's collections.
 *
 * Mongoose validates what Mongoose writes. These validators protect the collection from
 * everything else — a `mongosh` session during an incident, a hand-rolled repair script,
 * a future migration — by making the database itself refuse a malformed journal entry or
 * GL account. They are applied with `collMod`, so syncing them is idempotent and safe to
 * run on every boot.
 */

/** The chart of accounts, validated server-side. */
export const LEDGER_ACCOUNT_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['id', 'code', 'name', 'type'],
    properties: {
      id: { bsonType: 'string' },
      code: { bsonType: 'string', pattern: GL_CODE_PATTERN.source },
      name: { bsonType: 'string' },
      balances: { bsonType: 'object' },
    },
  },
} as const;

const VALIDATORS: Readonly<Record<string, object>> = {
  [JOURNAL_ENTRY_COLLECTION]: JOURNAL_ENTRY_VALIDATOR,
  [LEDGER_ACCOUNT_COLLECTION]: LEDGER_ACCOUNT_VALIDATOR,
};

/**
 * Creates each ledger collection with its validator, or upgrades it in place.
 *
 * `validationAction: 'error'` — a write that fails validation is rejected, not logged.
 * A ledger that merely *warns* about a malformed entry has already accepted it.
 */
export async function applyLedgerValidators(connection: Connection): Promise<void> {
  const logger = new Logger('LedgerValidators');
  const db = connection.db;
  if (!db) throw new RangeError('Cannot apply ledger validators before the connection is open.');

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

  for (const [collection, validator] of Object.entries(VALIDATORS)) {
    await syncOne(db, collection, validator, existing.has(collection));
  }

  logger.log(`Ledger validators synced: ${Object.keys(VALIDATORS).join(', ')}`);
}

const NAMESPACE_EXISTS_CODE = 48;

/**
 * One collection: create with the validator, or `collMod` it in place.
 *
 * The create can lose a race — another process booting at the same moment, or an index
 * build that materialises the collection first — in which case the namespace exists by
 * the time we ask, and the correct move is the upgrade path, not an error.
 */
async function syncOne(
  db: NonNullable<Connection['db']>,
  collection: string,
  validator: object,
  knownToExist: boolean,
): Promise<void> {
  if (knownToExist) {
    await db.command({ collMod: collection, validator, validationAction: 'error' });
    return;
  }

  try {
    await db.createCollection(collection, { validator, validationAction: 'error' });
  } catch (error) {
    // A bare `throw` is only legal inside a catch in some languages — not this one.
    if ((error as { code?: unknown }).code !== NAMESPACE_EXISTS_CODE) throw error;
    await db.command({ collMod: collection, validator, validationAction: 'error' });
  }
}
