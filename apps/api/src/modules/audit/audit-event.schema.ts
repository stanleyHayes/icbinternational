import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  publicIdProp,
} from '../../database/schema.helpers.js';

import { AUDIT_EVENT_COLLECTION, MAX_USER_AGENT_LENGTH } from './audit.constants.js';
import { type AuditActorType } from './audit.types.js';

/** One field-level difference, already redacted by the time it reaches the schema. */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class AuditChangeSchemaClass {
  @Prop({ required: true, type: String })
  field!: string;

  @Prop({ required: false, type: String, default: null })
  before!: string | null;

  @Prop({ required: false, type: String, default: null })
  after!: string | null;
}

export const AuditChangeSchema = SchemaFactory.createForClass(AuditChangeSchemaClass);

/**
 * An append-only, hash-chained record of a state change.
 *
 * Every field is `immutable`. Mongoose enforces that on a document save, and the query
 * middleware below closes the other door — a stray `updateOne` from some future module
 * that happened to get hold of this model. Neither is a security boundary against someone
 * with direct database access; both are there to make an accidental mutation impossible
 * and a deliberate one obvious.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: AUDIT_EVENT_COLLECTION })
export class AuditEventDocument {
  @Prop(publicIdProp)
  id!: string;

  /**
   * Position in the chain. The unique index is declared once, at the bottom of this file
   * — declaring it here too would register the same keys under two names, and MongoDB
   * refuses to build that. Uniqueness is what serialises appends without a lock.
   */
  @Prop({ type: Number, required: true, immutable: true })
  sequence!: number;

  @Prop({ type: String, required: true, immutable: true })
  actorType!: AuditActorType;

  @Prop({ type: String, required: true, immutable: true })
  actorId!: string;

  @Prop({ type: String, required: true, immutable: true })
  actorName!: string;

  /** Dotted verb, e.g. `account.freeze`. Queried by prefix in the ops console. */
  @Prop({ type: String, required: true, immutable: true })
  action!: string;

  @Prop({ type: String, required: true, immutable: true })
  entity!: string;

  @Prop({ type: String, required: true, immutable: true })
  entityId!: string;

  @Prop({ type: [AuditChangeSchema], required: true, default: [], immutable: true })
  changes!: AuditChangeSchemaClass[];

  @Prop({ type: String, required: false, default: null, immutable: true })
  ipAddress!: string | null;

  @Prop({
    type: String,
    required: false,
    default: null,
    immutable: true,
    maxlength: MAX_USER_AGENT_LENGTH,
  })
  userAgent!: string | null;

  /** Ties the event to the request's log lines and to the customer's error envelope. */
  @Prop({ type: String, required: true, immutable: true })
  traceId!: string;

  @Prop({ type: String, required: true, immutable: true })
  previousHash!: string;

  @Prop({ type: String, required: true, immutable: true })
  hash!: string;

  /** Simulated-clock instant the change happened. Not the insertion time. */
  @Prop({ type: Date, required: true, immutable: true })
  at!: Date;
}

export type AuditEventDoc = HydratedDocument<AuditEventDocument>;

export const AuditEventSchema = SchemaFactory.createForClass(AuditEventDocument);

// Chain order. Unique because the sequence *is* the chain position.
AuditEventSchema.index({ sequence: 1 }, { unique: true, name: 'audit_sequence_unique' });
// "What happened to this account?" — the question every investigation opens with.
AuditEventSchema.index({ entity: 1, entityId: 1, sequence: -1 }, { name: 'audit_entity' });
// The ops console's default view: most recent first.
AuditEventSchema.index({ at: -1 }, { name: 'audit_recent' });
// "What did this admin do?" — the question every insider-risk review opens with.
AuditEventSchema.index({ actorId: 1, at: -1 }, { name: 'audit_actor_recent' });

/**
 * Refuses any query that would rewrite or remove history.
 *
 * Thrown as an `AppError` rather than a bare `Error` because it still has to render in
 * the contract envelope if it ever reaches a request — though reaching one at all means
 * a caller has bypassed {@link AuditEventRepository}, which is the defect being caught.
 */
function refuseMutation(): never {
  throw new AppError({
    code: ErrorCode.INTERNAL_ERROR,
    message: `${AUDIT_EVENT_COLLECTION} is append-only. Record a compensating event instead.`,
  });
}

AuditEventSchema.pre('updateOne', refuseMutation);
AuditEventSchema.pre('updateMany', refuseMutation);
AuditEventSchema.pre('findOneAndUpdate', refuseMutation);
AuditEventSchema.pre('findOneAndReplace', refuseMutation);
AuditEventSchema.pre('replaceOne', refuseMutation);
AuditEventSchema.pre('findOneAndDelete', refuseMutation);
AuditEventSchema.pre('deleteOne', { document: false, query: true }, refuseMutation);
AuditEventSchema.pre('deleteMany', { document: false, query: true }, refuseMutation);
