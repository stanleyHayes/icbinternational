import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { type CreateFraudReportRequest } from '@reliance/contracts';

import { BASE_SCHEMA_OPTIONS, publicIdProp } from '../../database/schema.helpers.js';

import { FRAUD_REPORT_COLLECTION } from './fraud-report.constants.js';

@Schema({ ...BASE_SCHEMA_OPTIONS, collection: FRAUD_REPORT_COLLECTION, id: false })
export class FraudReportSchemaClass {
  @Prop(publicIdProp)
  id!: string;

  @Prop({ required: true, type: String, immutable: true })
  reference!: string;

  @Prop({ required: true, type: String, immutable: true, index: true })
  userId!: string;

  @Prop({
    required: true,
    type: String,
    enum: ['CARD_FRAUD', 'ACCOUNT_TAKEOVER', 'PHISHING', 'SCAM_PAYMENT', 'IDENTITY_THEFT'],
    immutable: true,
  })
  kind!: CreateFraudReportRequest['kind'];

  @Prop({ required: true, type: String, immutable: true })
  description!: string;

  @Prop({ required: true, type: [String], default: () => [], immutable: true })
  transactionIds!: string[];

  @Prop({ required: true, type: Boolean, immutable: true })
  freezeCards!: boolean;

  @Prop({ required: true, type: Boolean, immutable: true })
  freezeAccounts!: boolean;

  @Prop({ required: true, type: [String], default: () => [], immutable: true })
  frozenCardIds!: string[];

  @Prop({ required: true, type: [String], default: () => [], immutable: true })
  frozenAccountIds!: string[];

  @Prop({ required: false, type: String, default: null, immutable: true })
  ticketId!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FraudReportSchema = SchemaFactory.createForClass(FraudReportSchemaClass);
export type FraudReportDocument = HydratedDocument<FraudReportSchemaClass>;

FraudReportSchema.index({ userId: 1, createdAt: -1, id: -1 });
