import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { PostingDirection } from '@reliance/contracts';

import { type StoredMoney } from '../../../common/money/money.codec.js';
import { EMBEDDED_SCHEMA_OPTIONS, moneyProp } from '../../../database/schema.helpers.js';
import { GL_CODE_PATTERN } from '../ledger.constants.js';

/**
 * One side of a journal entry, embedded in its parent.
 *
 * Postings are embedded rather than stored in their own collection so that an entry and
 * its legs are written by a single document write. A separate collection would make
 * "the entry exists but half its postings do not" representable, and a ledger whose
 * invalid states are representable is a ledger that will eventually reach one.
 *
 * `ledgerAccountName` is denormalised deliberately: a statement reprinted in five years
 * must show the account name as it was at the time of posting, not as it is today.
 */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class PostingSchemaClass {
  @Prop({ required: true, type: String, match: GL_CODE_PATTERN })
  ledgerAccountCode!: string;

  @Prop({ required: true, type: String })
  ledgerAccountName!: string;

  /** Set when this leg also moves a customer-facing balance; null for a pure GL leg. */
  @Prop({ required: false, type: String, default: null })
  accountId!: string | null;

  @Prop({ required: true, type: String, enum: Object.values(PostingDirection) })
  direction!: PostingDirection;

  /** Always positive. The direction carries the sign — see the domain `Posting`. */
  @Prop(moneyProp)
  amount!: StoredMoney;

  @Prop({ required: true, type: String })
  narrative!: string;
}

export const PostingSchema = SchemaFactory.createForClass(PostingSchemaClass);
