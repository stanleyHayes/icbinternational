import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { EMBEDDED_SCHEMA_OPTIONS } from '../../../database/schema.helpers.js';
import { MAX_COUNTERPARTY_NAME_LENGTH } from '../transactions.constants.js';

/** ISO 18245 merchant category code — four digits, or absent for non-card movement. */
const MCC_PATTERN = /^\d{4}$/;

/** ISO 3166-1 alpha-2. */
const COUNTRY_CODE_LENGTH = 2;

/**
 * Who was on the other side, as it should read on a statement.
 *
 * Embedded rather than referenced, and denormalised on purpose: a merchant can rebrand,
 * a payee can change their name, and a statement reprinted in five years must still show
 * what the customer saw at the time. Joining to a live merchant record would quietly
 * rewrite history every time the merchant edited their profile.
 *
 * Every field but `name` is nullable because the rails genuinely differ — a card
 * authorisation carries an MCC and no account number, a domestic credit transfer carries
 * a masked account number and no MCC.
 */
@Schema(EMBEDDED_SCHEMA_OPTIONS)
export class CounterpartySchemaClass {
  @Prop({ required: true, type: String, maxlength: MAX_COUNTERPARTY_NAME_LENGTH })
  name!: string;

  @Prop({ required: false, type: String, default: null })
  merchantId!: string | null;

  @Prop({ required: false, type: String, default: null, match: MCC_PATTERN })
  mcc!: string | null;

  @Prop({ required: false, type: String, default: null })
  logoUrl!: string | null;

  @Prop({ required: false, type: String, default: null })
  accountNumberMasked!: string | null;

  @Prop({ required: false, type: String, default: null, minlength: COUNTRY_CODE_LENGTH })
  country!: string | null;
}

export const CounterpartySchema = SchemaFactory.createForClass(CounterpartySchemaClass);
