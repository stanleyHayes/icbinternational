import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { RecurrenceFrequency, TransferOrderStatus } from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp, publicIdProp } from '../../database/schema.helpers.js';

import { TRANSFER_ORDER_COLLECTION } from './transfer-order.constants.js';

/**
 * A customer's instruction to pay the same payee on a repeating schedule.
 *
 * **The rule is stored, not the dates.** A standing order keeps its cadence — frequency,
 * day of the month or week, start, end, cap — and exactly one derived date, `nextRunAt`.
 * Materialising every future occurrence would mean a monthly order for a mortgage
 * carrying three hundred rows that all have to be rewritten the moment the customer
 * changes the day, and any one of them left stale is a payment on a date nobody chose.
 *
 * **Pausing does not touch `nextRunAt`.** `status` alone gates the run sweep, so a paused
 * order keeps the date it was heading for and resuming can put the schedule back on its
 * own cadence rather than starting a new one from the day the customer pressed resume.
 *
 * **The start, end and day-of-month are calendar dates, held as `YYYY-MM-DD` strings.** A
 * standing order runs on a day rather than at an instant; storing a `Date` would attach a
 * midnight that is only midnight in one time zone and invite a comparison that is a day
 * out for half the year.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: TRANSFER_ORDER_COLLECTION, id: false })
export class TransferOrderSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ type: String, required: true, immutable: true, index: true })
  userId!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true, enum: Object.values(TransferOrderStatus), index: true })
  status!: TransferOrderStatus;

  @Prop({ type: String, required: true, immutable: true, index: true })
  sourceAccountId!: string;

  /**
   * Immutable, and that is the point of the field.
   *
   * Repointing a live standing order at a different payee is not an amendment, it is a
   * new instruction — and it is the single change that turns "my rent went up" into "my
   * rent went somewhere else". A customer who wants to pay someone else sets one up.
   */
  @Prop({ type: String, required: true, immutable: true })
  beneficiaryId!: string;

  @Prop(moneyProp)
  amount!: StoredMoney;

  @Prop({ type: String, default: null })
  reference!: string | null;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(RecurrenceFrequency) })
  frequency!: RecurrenceFrequency;

  @Prop({ type: Number, default: null })
  dayOfMonth!: number | null;

  @Prop({ type: Number, default: null })
  dayOfWeek!: number | null;

  @Prop({ type: String, required: true, immutable: true })
  startsOn!: string;

  @Prop({ type: String, default: null })
  endsOn!: string | null;

  @Prop({ type: Number, default: null })
  maxOccurrences!: number | null;

  @Prop({ type: Number, required: true, default: 0 })
  occurrencesRun!: number;

  @Prop({ type: Date, default: null, index: true })
  nextRunAt!: Date | null;

  @Prop({ type: Date, default: null })
  lastRunAt!: Date | null;

  /** Reset by the run engine on a payment that lands. Escalates the order to `FAILING`. */
  @Prop({ type: Number, required: true, default: 0 })
  consecutiveFailures!: number;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type TransferOrderDocument = HydratedDocument<TransferOrderSchemaClass>;

export const TransferOrderSchema = SchemaFactory.createForClass(TransferOrderSchemaClass);

/** The customer's list, newest first, optionally narrowed to one status. */
TransferOrderSchema.index({ userId: 1, status: 1, createdAt: -1 });

/** The run engine's read: active, and due. */
TransferOrderSchema.index({ status: 1, nextRunAt: 1 });
