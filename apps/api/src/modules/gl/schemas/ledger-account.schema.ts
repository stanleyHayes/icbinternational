import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { LedgerAccountType } from '@reliance/contracts';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../../database/schema.helpers.js';
import { GL_CODE_PATTERN, LEDGER_ACCOUNT_COLLECTION } from '../../ledger/ledger.constants.js';

/**
 * The GL module's lifecycle view of a chart-of-accounts row.
 *
 * Two models share the `chart_of_accounts` collection, by design. The ledger module's
 * `LedgerAccount` model owns the balance projection its posting service maintains; this
 * model owns the row's lifecycle — `active` — and the guarded admin CRUD over names.
 * Neither writes the other's fields, and the shared fields (`code`, `name`, `type`,
 * `isControlAccount`) are defined identically in both. The split exists because a model
 * name can be registered only once per connection, and the ledger module owns
 * `LedgerAccount`.
 *
 * No balance is stored or read through this model: a balance is a projection of the
 * postings (ADR-001), recomputed from `journal_entries` on every read.
 *
 * `code` and `type` are immutable once written — postings denormalise both at posting
 * time, so rewriting history's accounting treatment by editing a row must stay
 * impossible.
 */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: LEDGER_ACCOUNT_COLLECTION, id: false })
export class GlChartAccountSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  /** Four-digit GL code (`2000 Customer Deposits`). The business key. */
  @Prop({ required: true, type: String, match: GL_CODE_PATTERN, unique: true, immutable: true })
  code!: string;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String, enum: Object.values(LedgerAccountType), immutable: true })
  type!: LedgerAccountType;

  /** Control accounts roll up customer accounts; operators never post to them directly. */
  @Prop({ required: true, type: Boolean, default: false, immutable: true })
  isControlAccount!: boolean;

  /** Retired rows stay in the chart — history references them — but accept no new use. */
  @Prop({ required: true, type: Boolean, default: true })
  active!: boolean;
}

export const GlChartAccountSchema = SchemaFactory.createForClass(GlChartAccountSchemaClass);

export type GlChartAccountDocument = HydratedDocument<GlChartAccountSchemaClass>;
