import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { ChatAuthorType, ChatConversationStatus } from '@reliance/contracts';

import {
  BASE_SCHEMA_OPTIONS,
  EMBEDDED_SCHEMA_OPTIONS,
  publicIdProp,
} from '../../database/schema.helpers.js';

import { CHAT_COLLECTION } from './chat.constants.js';

/**
 * One message in the thread, embedded.
 *
 * Stored with the conversation rather than in a side collection for the same reason a
 * ticket's thread is: both front ends render the whole conversation every time it is
 * read, so a join would buy nothing. `authorName` is denormalised onto the message — it
 * is what the participant was shown when the words arrived, and an agent who later
 * changes their display name must not silently rewrite it.
 */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class ChatMessageSchemaClass {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ required: true, type: String, enum: Object.values(ChatAuthorType) })
  authorType!: ChatAuthorType;

  @Prop({ required: true, type: String })
  authorName!: string;

  @Prop({ required: true, type: String })
  body!: string;

  @Prop({ required: true, type: Date })
  sentAt!: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessageSchemaClass);

/** Who started the conversation from the public site, when nobody signed in. */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class ChatGuestSchemaClass {
  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String })
  email!: string;
}

export const ChatGuestSchema = SchemaFactory.createForClass(ChatGuestSchemaClass);

/**
 * A live chat conversation.
 *
 * Exactly one of `customerUserId` and `guest` is set: a conversation belongs to a
 * signed-in customer or to a named visitor from the marketing site, never to both.
 *
 * Unlike a ticket, unread state is two counters rather than two read positions. Chat
 * traffic is one message at a time and both sides are typically watching live, so the
 * count the badge shows *is* the state; a read position would answer a question — "how
 * far down the thread have you seen" — that a chat client never asks.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: CHAT_COLLECTION, id: false })
export class ChatConversationSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ required: true, type: String, enum: Object.values(ChatConversationStatus) })
  status!: ChatConversationStatus;

  @Prop({ required: true, type: String })
  subject!: string;

  /** Owning customer, `usr_…`. Null for a guest conversation from the public site. */
  @Prop({ required: false, type: String, default: null, immutable: true })
  customerUserId!: string | null;

  /** The visitor behind a guest conversation. Null for a customer's. */
  @Prop({ required: false, type: ChatGuestSchema, default: null, immutable: true })
  guest!: ChatGuestSchemaClass | null;

  /** The name participants see on the bank's replies. Null until somebody takes it. */
  @Prop({ required: false, type: String, default: null })
  assignedAgentName!: string | null;

  @Prop({ required: true, type: [ChatMessageSchema], default: () => [] })
  messages!: ChatMessageSchemaClass[];

  /** Agent-side messages the customer or guest has not seen. */
  @Prop({ required: true, type: Number, default: 0, min: 0 })
  unreadCount!: number;

  /** Customer/guest-side messages not yet surfaced in the agent inbox. */
  @Prop({ required: true, type: Number, default: 0, min: 0 })
  agentUnreadCount!: number;

  /** Drives the inbox ordering: most recently spoken-to conversation first. */
  @Prop({ required: true, type: Date })
  lastMessageAt!: Date;

  @Prop({ required: false, type: Date, default: null })
  closedAt!: Date | null;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export const ChatConversationSchema = SchemaFactory.createForClass(ChatConversationSchemaClass);

export type ChatConversationDocument = HydratedDocument<ChatConversationSchemaClass>;

/** A customer's own conversations, most recently active first. */
ChatConversationSchema.index({ customerUserId: 1, lastMessageAt: -1, id: -1 });

/** The agent inbox, most recently active first, and the status filter over it. */
ChatConversationSchema.index({ status: 1, lastMessageAt: -1, id: -1 });
