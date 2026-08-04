/**
 * Persistence for the `customer_profiles` collection.
 *
 * Deliberately not an `AuditSubjectLoader`. The only field worth diffing is ciphertext,
 * and a before/after pair of blobs tells an investigator nothing while doubling the number
 * of places the sealed data is written down.
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { BaseRepository } from '../../database/base.repository.js';

import { CUSTOMER_PROFILE_MODEL } from './profile.constants.js';
import { type CustomerProfileDocument, type CustomerProfileSchemaClass } from './profile.schema.js';

type Filter = QueryFilter<CustomerProfileSchemaClass>;

@Injectable()
export class ProfileRepository extends BaseRepository<CustomerProfileSchemaClass> {
  constructor(@InjectModel(CUSTOMER_PROFILE_MODEL) model: Model<CustomerProfileSchemaClass>) {
    super(model);
  }

  /** The customer's record, or null while they have corrected nothing. */
  async findByUser(
    userId: string,
    session?: ClientSession,
  ): Promise<CustomerProfileDocument | null> {
    return this.findOne({ userId } as Filter, session) as Promise<CustomerProfileDocument | null>;
  }

  /**
   * Writes the sealed corrections, creating the record on first use.
   *
   * An upsert rather than a read-then-insert: two tabs saving different fields at the same
   * moment would both find no record and both insert, and only the unique index on
   * `userId` decides which of them survives. Upserting lets the second write land on the
   * first one's document instead of losing a race.
   */
  async writeDetails(userId: string, details: string): Promise<CustomerProfileDocument> {
    return this.collection
      .findOneAndUpdate({ userId } as Filter, { $set: { details } }, { new: true, upsert: true })
      .exec() as Promise<CustomerProfileDocument>;
  }
}
