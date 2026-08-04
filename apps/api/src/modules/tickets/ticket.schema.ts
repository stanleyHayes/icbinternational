import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { TicketPriority, TicketStatus, TicketTopic } from '@reliance/contracts';

import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  publicIdProp,
} from '../../database/schema.helpers.js';

import {
  MAX_SATISFACTION_RATING,
  MIN_SATISFACTION_RATING,
  TICKET_COLLECTION,
} from './tickets.constants.js';

const AUTHOR_TYPES = ['CUSTOMER', 'AGENT', 'SYSTEM'];

/**
 * One message in the thread, embedded.
 *
 * The contract ships the whole conversation with the ticket and both front ends render it
 * that way, so it is stored with the ticket rather than in a side collection: a thread is
 * read every single time the ticket is, and a join to fetch it would buy nothing.
 *
 * `authorName` is denormalised rather than resolved on read. It is what the customer was
 * shown when the message arrived, and an agent who later changes their display name — or
 * leaves — must not silently rewrite what a customer remembers being told.
 */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class TicketMessageSchemaClass {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ required: true, type: String, enum: AUTHOR_TYPES })
  authorType!: 'CUSTOMER' | 'AGENT' | 'SYSTEM';

  @Prop({ required: true, type: String })
  authorName!: string;

  @Prop({ required: true, type: String })
  body!: string;

  @Prop({ required: true, type: [String], default: () => [] })
  attachmentIds!: string[];

  @Prop({ required: true, type: Date })
  sentAt!: Date;
}

export const TicketMessageSchema = SchemaFactory.createForClass(TicketMessageSchemaClass);

/**
 * A support conversation.
 *
 * The two read positions are what make an unread badge possible without a per-message
 * receipt table. Each side's count is derived from its own position and the other side's
 * messages, so the same stored thread answers "two new replies" to the customer and
 * "one unanswered message" to the agent without either being told about the other's
 * reading habits.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: TICKET_COLLECTION, id: false })
export class TicketSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ required: true, type: String, immutable: true })
  userId!: string;

  @Prop({ required: true, type: String, immutable: true })
  subject!: string;

  @Prop({ required: true, type: String, enum: Object.values(TicketTopic), immutable: true })
  topic!: TicketTopic;

  @Prop({ required: true, type: String, enum: Object.values(TicketStatus) })
  status!: TicketStatus;

  @Prop({ required: true, type: String, enum: Object.values(TicketPriority) })
  priority!: TicketPriority;

  /** The name the customer sees on the bank's replies. Null until somebody takes it. */
  @Prop({ required: false, type: String, default: null })
  assignedAgentName!: string | null;

  @Prop({ required: false, type: String, default: null, immutable: true })
  relatedTransactionId!: string | null;

  @Prop({ required: true, type: [TicketMessageSchema], default: () => [] })
  messages!: TicketMessageSchemaClass[];

  /** How many messages each side has read. See `TicketRecord` for why it is not a date. */
  @Prop({ required: true, type: Number, default: 0, min: 0 })
  customerReadUpTo!: number;

  @Prop({ required: true, type: Number, default: 0, min: 0 })
  agentReadUpTo!: number;

  /** When the bank has committed to respond by. Null when the move is the customer's. */
  @Prop({ required: false, type: Date, default: null })
  slaDueAt!: Date | null;

  @Prop({
    required: false,
    type: Number,
    default: null,
    min: MIN_SATISFACTION_RATING,
    max: MAX_SATISFACTION_RATING,
  })
  satisfactionRating!: number | null;

  @Prop({ required: false, type: Date, default: null })
  resolvedAt!: Date | null;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export const TicketSchema = SchemaFactory.createForClass(TicketSchemaClass);

export type TicketDocument = HydratedDocument<TicketSchemaClass>;

/** The customer's own list, newest conversation first. */
TicketSchema.index({ userId: 1, createdAt: -1, id: -1 });

/** The support queue, longest-waiting first, and the status filter over it. */
TicketSchema.index({ status: 1, createdAt: 1, id: 1 });
