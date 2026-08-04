import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, mongo } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../common/clock/clock.service.js';
import { AppError } from '../common/errors/app-error.js';

import { type SeedOutcome } from './seed.types.js';

/** A document the seed owns. Plain data — no Mongo types leak into a seed definition. */
export type SeedDocument = Record<string, unknown>;

/** One collection's worth of seed data and the fields that identify a row within it. */
export interface SeedSet {
  readonly collection: string;
  /** Natural key. `['code']` for a currency, `['id']` for a biller. Never `_id`. */
  readonly keyFields: readonly string[];
  readonly documents: readonly SeedDocument[];
}

type BulkOperation = mongo.AnyBulkWriteOperation<SeedDocument>;

/**
 * Writes foundation data without disturbing anything the seed does not own.
 *
 * Three decisions are worth explaining.
 *
 * **It compares before it writes.** A plain upsert that `$set`s every record on every run
 * would touch `updatedAt` each time, and "the second run changes nothing" would stop being
 * true the moment anything audited that field. Each run reads what is stored, compares it
 * to the definition, and writes only the rows that actually differ. That also makes the
 * summary honest: "0 inserted, 0 updated" is a measurement, not an assumption.
 *
 * **It compares only the fields it owns.** A stored document may carry anything else — the
 * timestamps, an `_id`, a flag a feature module added later. The seed asserts values for
 * its own fields and is deliberately blind to the rest, so re-seeding never reverts a
 * change it has no opinion about. Within its own fields it is authoritative: a value
 * edited by hand in the database is drift, and the next run repairs it.
 *
 * **It uses the raw collection, not a Mongoose model.** Billers, locations, currencies and
 * admin roles belong to feature modules being written in parallel. Registering a second
 * schema for a collection another module also models is a runtime collision, and inventing
 * indexes on someone else's collection is a merge conflict waiting to happen. The seed
 * writes by natural key and leaves schema ownership where it belongs.
 */
@Injectable()
export class SeedWriter {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly clock: ClockService,
  ) {}

  /** Brings a collection into line with its seed definition, writing only what differs. */
  async sync(set: SeedSet): Promise<SeedOutcome> {
    const stored = await this.storedFields(set);
    const now = this.clock.now();

    const operations: BulkOperation[] = [];
    let inserted = 0;
    let unchanged = 0;

    for (const document of set.documents) {
      const key = keyOf(document, set.keyFields);
      const existing = stored.get(canonicalise(key));

      if (existing === undefined) {
        inserted += 1;
      } else if (existing === canonicalise(document)) {
        unchanged += 1;
        continue;
      }

      operations.push(upsertOperation(key, document, now));
    }

    if (operations.length > 0) {
      await this.handle(set.collection).bulkWrite(operations, { ordered: false });
    }

    return {
      collection: set.collection,
      inserted,
      updated: operations.length - inserted,
      unchanged,
    };
  }

  /**
   * What is stored today, reduced to the fields the seed owns, keyed by natural key.
   *
   * Projecting rather than fetching whole documents keeps the comparison honest: a field
   * that is not in the projection cannot accidentally be counted as drift.
   */
  private async storedFields(set: SeedSet): Promise<Map<string, string>> {
    const keys = set.documents.map((document) => keyOf(document, set.keyFields));
    if (keys.length === 0) return new Map();

    const fields = ownedFields(set.documents);
    const projection = Object.fromEntries([['_id', 0], ...fields.map((field) => [field, 1])]);

    const documents = await this.handle(set.collection)
      .find({ $or: keys }, { projection })
      .toArray();

    return new Map(
      documents.map((document) => [
        canonicalise(keyOf(document, set.keyFields)),
        canonicalise(pick(document, fields)),
      ]),
    );
  }

  private handle(collection: string) {
    const database = this.connection.db;
    if (!database) {
      throw new AppError({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'The seed cannot run before the database connection is established',
      });
    }
    return database.collection<SeedDocument>(collection);
  }
}

function upsertOperation(key: SeedDocument, document: SeedDocument, now: Date): BulkOperation {
  return {
    updateOne: {
      filter: key,
      update: { $set: { ...document, updatedAt: now }, $setOnInsert: { createdAt: now } },
      upsert: true,
    },
  };
}

function keyOf(document: SeedDocument, keyFields: readonly string[]): SeedDocument {
  return Object.fromEntries(keyFields.map((field) => [field, document[field]]));
}

/** Every field name any document in the set defines, sorted and de-duplicated. */
function ownedFields(documents: readonly SeedDocument[]): string[] {
  const fields = new Set<string>();
  for (const document of documents) {
    for (const field of Object.keys(document)) fields.add(field);
  }
  return [...fields].sort((left, right) => left.localeCompare(right));
}

/**
 * Reduces a stored document to the seed's own fields.
 *
 * Fields absent from storage are omitted rather than set to `undefined`, so a document
 * missing a field the seed defines compares as different and gets repaired.
 */
function pick(document: SeedDocument, fields: readonly string[]): SeedDocument {
  const picked: SeedDocument = {};
  for (const field of fields) {
    if (field in document) picked[field] = document[field];
  }
  return picked;
}

/**
 * JSON with object keys sorted at every depth.
 *
 * `JSON.stringify` preserves insertion order, and Mongo returns fields in storage order
 * rather than definition order — so without sorting, every document would compare as
 * changed and the seed would rewrite the whole catalogue on every run.
 */
export function canonicalise(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortDeep(item));
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value !== 'object') return value;

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left < right ? -1 : 1,
  );

  return Object.fromEntries(entries.map(([key, item]) => [key, sortDeep(item)]));
}
