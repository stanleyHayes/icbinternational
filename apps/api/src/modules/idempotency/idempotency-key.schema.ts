import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { BASE_SCHEMA_OPTIONS } from '../../database/schema.helpers.js';

import {
  IDEMPOTENCY_KEY_COLLECTION,
  IDEMPOTENCY_KEY_TTL_SECONDS,
  MAX_KEY_LENGTH,
} from './idempotency.constants.js';

/** Lifecycle of a claimed key. There is no FAILED state — a failure releases the key. */
export const IdempotencyStatus = {
  /** Claimed, handler still running. A second request for this key is a duplicate. */
  IN_FLIGHT: 'IN_FLIGHT',
  /** Handler finished; `responseStatus` and `responseBody` are the answer to replay. */
  COMPLETED: 'COMPLETED',
} as const;
export type IdempotencyStatus = (typeof IdempotencyStatus)[keyof typeof IdempotencyStatus];

/**
 * A claimed idempotency key and, once the work is done, the response it produced.
 *
 * The compound unique index on `{key, userId}` is the entire concurrency-control
 * mechanism. Claiming is a single `insertOne`: either it succeeds and this request owns
 * the key, or the index rejects it and someone else already does. There is no read
 * beforehand, because a read-then-write leaves a window in which two concurrent requests
 * both see "no existing key" and both execute — which for a transfer means sending the
 * money twice.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: IDEMPOTENCY_KEY_COLLECTION })
export class IdempotencyKeyDocument {
  /** The client's `Idempotency-Key` header, verbatim. */
  @Prop({ type: String, required: true, immutable: true, maxlength: MAX_KEY_LENGTH })
  key!: string;

  /** Caller scope. A key belongs to one caller; two customers may reuse the same string. */
  @Prop({ type: String, required: true, immutable: true })
  userId!: string;

  /**
   * Fingerprint of method, path and body.
   *
   * Stored so a replay can be distinguished from a *reuse*: the same key with a different
   * payload is a client bug — usually a key generated once and reused for a second, real
   * transfer — and must be rejected rather than answered with the first transfer's receipt.
   */
  @Prop({ type: String, required: true, immutable: true })
  requestHash!: string;

  @Prop({ type: String, required: true, enum: Object.values(IdempotencyStatus) })
  status!: IdempotencyStatus;

  @Prop({ type: Number, required: false, default: null })
  responseStatus!: number | null;

  /**
   * The handler's return value, replayed verbatim.
   *
   * `Mixed` because it is whatever the endpoint answers; nothing here interprets it.
   */
  @Prop({ type: Object, required: false, default: null })
  responseBody!: unknown;

  @Prop({ type: Date, required: false, default: null })
  completedAt!: Date | null;

  /** Managed by the schema's timestamps. Declared so the TTL index has a typed field. */
  @Prop({ type: Date })
  createdAt!: Date;
}

export type IdempotencyKeyDoc = HydratedDocument<IdempotencyKeyDocument>;

export const IdempotencyKeySchema = SchemaFactory.createForClass(IdempotencyKeyDocument);

// The race-free claim depends on this index existing. Without it, `insertOne` never
// rejects and every concurrent duplicate executes.
IdempotencyKeySchema.index({ key: 1, userId: 1 }, { unique: true, name: 'idempotency_key_scope' });

// Retention. Expiry is measured from insertion in real time — see the constant's comment.
IdempotencyKeySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: IDEMPOTENCY_KEY_TTL_SECONDS, name: 'idempotency_ttl' },
);
