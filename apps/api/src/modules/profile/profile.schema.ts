/**
 * Persistence shape of a customer's profile corrections.
 *
 * There is no public `prf_` id and no prefixed identifier prop: the contract addresses a
 * profile by the customer who owns it and nothing else, so `userId` is the key. Minting a
 * second identifier would only create a way to name the record that the API never uses.
 *
 * `details` is ciphertext (see `profile-details.ts`). Everything else on the document is
 * workflow metadata that is safe to index.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

import { BASE_SCHEMA_OPTIONS } from '../../database/schema.helpers.js';

import { CUSTOMER_PROFILE_COLLECTION } from './profile.constants.js';

/** One customer's corrections to the details the bank holds for them. */
@Schema({ ...BASE_SCHEMA_OPTIONS, collection: CUSTOMER_PROFILE_COLLECTION, id: false })
export class CustomerProfileSchemaClass {
  @Prop({ type: String, required: true, unique: true, index: true, immutable: true })
  userId!: string;

  /** The sealed corrections. Ciphertext; see `profile-details.ts`. */
  @Prop({ type: String, default: '' })
  details!: string;

  /** Populated by Mongoose's `timestamps` option. */
  createdAt!: Date;
  updatedAt!: Date;
}

export type CustomerProfileDocument = HydratedDocument<CustomerProfileSchemaClass>;

export const CustomerProfileSchema = SchemaFactory.createForClass(CustomerProfileSchemaClass);
