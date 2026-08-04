import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { ErrorCode, EntryType, JournalEntryStatus, PostingDirection } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../../database/schema.helpers.js';
import {
  GL_CODE_PATTERN,
  JOURNAL_ENTRY_COLLECTION,
  MINIMUM_POSTINGS_PER_ENTRY,
} from '../ledger.constants.js';

import { PostingSchema, type PostingSchemaClass } from './posting.schema.js';

/** Integer minor units as persisted — the same shape `StoredMoney` guarantees. */
const MINOR_UNITS_PATTERN = String.raw`^-?\d+$`;

/**
 * The system of record. One document per atomic financial event, and never edited.
 *
 * Almost every field is `immutable`, which in Mongoose means an update that tries to
 * change it is dropped rather than applied. Only `status` and `reversedByEntryId` move,
 * and only from `POSTED` to `REVERSED`. A correction is a new opposing entry; history is
 * append-only or the audit trail is decoration.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: JOURNAL_ENTRY_COLLECTION, id: false })
export class JournalEntrySchemaClass {
  @Prop(publicIdProp)
  id!: string;

  /**
   * Business-unique key for the event that caused this entry.
   *
   * The unique index on it is the ledger's last line of defence against double-booking:
   * behind the idempotency interceptor, behind the service's own read-before-write, the
   * database itself will still refuse a second entry for the same event.
   */
  @Prop({ required: true, type: String, unique: true, immutable: true })
  reference!: string;

  @Prop({ required: true, type: String, enum: Object.values(EntryType), immutable: true })
  type!: EntryType;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(JournalEntryStatus),
    default: JournalEntryStatus.POSTED,
  })
  status!: JournalEntryStatus;

  @Prop({ required: true, type: String, immutable: true })
  description!: string;

  /** Accounting date, `YYYY-MM-DD`. May precede `bookedAt` for a back-valued item. */
  @Prop({ required: true, type: String, immutable: true })
  valueDate!: string;

  @Prop({ required: true, type: Date, immutable: true })
  bookedAt!: Date;

  @Prop({ required: true, type: [PostingSchema], immutable: true })
  postings!: PostingSchemaClass[];

  /** Set on a reversing entry, pointing at what it undoes. */
  @Prop({ required: false, type: String, default: null, immutable: true })
  reversesEntryId!: string | null;

  /** Set on the original once its reversal has been posted. The one mutable link. */
  @Prop({ required: false, type: String, default: null })
  reversedByEntryId!: string | null;

  @Prop({ required: true, type: Object, default: () => ({}) })
  metadata!: Record<string, string>;
}

export const JournalEntrySchema = SchemaFactory.createForClass(JournalEntrySchemaClass);

export type JournalEntryDocument = HydratedDocument<JournalEntrySchemaClass>;

/**
 * `bookedAt` descending with `id` as the tie-breaker.
 *
 * The customer-facing feed pages newest-first and two entries can share a millisecond, so
 * the sort needs a total order or a cursor will skip or repeat a row at the boundary.
 * ULIDs sort chronologically, which makes `id` a free tie-breaker.
 */
JournalEntrySchema.index({ bookedAt: -1, id: -1 });

/** Serving "everything that touched this account" without a collection scan. */
JournalEntrySchema.index({ 'postings.accountId': 1, bookedAt: -1 });

/** Reconciliation reads by status; reversal sweeps read the reversed subset. */
JournalEntrySchema.index({ status: 1, bookedAt: -1 });

/**
 * Belt and braces for the ≥2 postings rule.
 *
 * The domain constructor already makes an unbalanced or single-legged entry impossible to
 * build, so reaching this hook means something bypassed the domain — a migration, a
 * repair script, a future contributor writing through the model directly. Failing here
 * costs one comparison and turns a silent corruption into a loud one.
 */
JournalEntrySchema.pre(
  'validate',
  // Mongoose 9 middleware has no `next` callback — a throw aborts the write.
  function assertMinimumPostings(this: JournalEntryDocument): void {
    const postings: unknown = this.get('postings');
    const count = Array.isArray(postings) ? postings.length : 0;

    if (count < MINIMUM_POSTINGS_PER_ENTRY) {
      // `AppError` rather than a bare `Error` so the failure still renders as a contract
      // envelope, and `UNBALANCED_JOURNAL_ENTRY` (a 500) because reaching this hook means
      // the writer has a defect — it is never something a customer did wrong.
      throw new AppError({
        code: ErrorCode.UNBALANCED_JOURNAL_ENTRY,
        message:
          `A journal entry needs at least ${MINIMUM_POSTINGS_PER_ENTRY} postings, got ${count}. ` +
          'Single-legged entries are not double-entry and are never written.',
        context: { reference: this.get('reference') },
      });
    }
  },
);

/**
 * Server-side validation applied with `collMod`, independent of this process.
 *
 * A Mongoose hook protects writes that go through Mongoose. This protects the collection
 * itself, so an operator at a `mongosh` prompt during an incident cannot insert a
 * malformed entry into the bank's system of record at three in the morning.
 */
export const JOURNAL_ENTRY_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['id', 'reference', 'type', 'status', 'valueDate', 'bookedAt', 'postings'],
    properties: {
      id: { bsonType: 'string' },
      reference: { bsonType: 'string' },
      postings: {
        bsonType: 'array',
        minItems: MINIMUM_POSTINGS_PER_ENTRY,
        items: {
          bsonType: 'object',
          required: ['ledgerAccountCode', 'direction', 'amount'],
          properties: {
            ledgerAccountCode: { bsonType: 'string', pattern: GL_CODE_PATTERN.source },
            direction: { enum: Object.values(PostingDirection) },
            amount: {
              bsonType: 'object',
              required: ['amount', 'currency'],
              // Minor units are stored as an integer string; a float here would mean
              // someone found a way to write money as a double.
              properties: { amount: { bsonType: 'string', pattern: MINOR_UNITS_PATTERN } },
            },
          },
        },
      },
    },
  },
} as const;
