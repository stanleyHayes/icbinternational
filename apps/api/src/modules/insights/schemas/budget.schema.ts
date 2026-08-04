import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { SpendCategory } from '@reliance/contracts';

import { type StoredMoney } from '../../../common/money/money.codec.js';
import { BASE_SCHEMA_OPTIONS, moneyProp, publicIdProp } from '../../../database/schema.helpers.js';
import { BASIS_POINTS_SCALE, BUDGET_COLLECTION } from '../insights.constants.js';

/**
 * A monthly spending limit a customer set for one category.
 *
 * Only the limit is stored. `spent`, `remaining` and `utilisationBps` are computed from
 * the transaction list on every read, never persisted — a stored counter would have to be
 * updated on every posting, would drift the first time one was missed, and would disagree
 * with the spend screen that a customer is looking at in the next tab.
 *
 * The period is likewise not stored. A budget is a standing intention ("no more than £300
 * on dining"), not a document per month, so it applies to whichever month is being asked
 * about. That also means a customer's budgets do not silently stop working in January.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: BUDGET_COLLECTION, id: false })
export class BudgetSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ required: true, type: String, immutable: true })
  userId!: string;

  @Prop({ required: true, type: String, enum: Object.values(SpendCategory), immutable: true })
  category!: SpendCategory;

  @Prop(moneyProp)
  limit!: StoredMoney;

  /** Where the customer wants to be warned, in basis points of the limit. */
  @Prop({ required: true, type: Number, min: 0, max: BASIS_POINTS_SCALE })
  alertAtBps!: number;
}

export const BudgetSchema = SchemaFactory.createForClass(BudgetSchemaClass);

export type BudgetDocument = HydratedDocument<BudgetSchemaClass>;

/**
 * One budget per customer per category.
 *
 * Unique rather than merely indexed, so "set my dining budget to £300" is an upsert with
 * a database-enforced outcome rather than a read-modify-write two clicks can race into
 * two rows — which would then both be displayed, both be half right, and be impossible
 * for the customer to reconcile.
 */
BudgetSchema.index({ userId: 1, category: 1 }, { unique: true });
