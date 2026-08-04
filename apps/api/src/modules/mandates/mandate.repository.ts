import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { MandateStatus } from '@reliance/contracts';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { MANDATE_MODEL, RETAINED_COLLECTIONS } from './mandate.constants.js';
import { MandateSchemaClass, type MandateDocument } from './mandate.schema.js';
import {
  MandateStore,
  type MandateListQuery,
  type MandateRecord,
  type MandateTransition,
  type NewMandate,
  type RecordCollectionInput,
  type RecordRefundInput,
} from './mandate.store.js';

/**
 * MongoDB-backed mandate persistence.
 *
 * Two writes carry the module's guarantees.
 *
 * {@link recordCollection} filters on `status: ACTIVE`, so a merchant collecting and a
 * customer cancelling race in the database and exactly one wins. If the cancellation lands
 * first the collection matches nothing, the caller's transaction rolls back, and the
 * customer's account is untouched.
 *
 * {@link recordRefund} matches the collection by its journal entry *and* by not having been
 * refunded already, so a customer pressing the button twice under the guarantee is refunded
 * once. The history is capped with `$slice` at the length of the guarantee window: older
 * collections are past the point where they can be claimed, and the journal keeps them
 * permanently regardless.
 */
@Injectable()
export class MandateRepository extends MandateStore {
  constructor(
    @InjectModel(MANDATE_MODEL) private readonly model: Model<MandateSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  override async insert(mandate: NewMandate, session?: ClientSession): Promise<MandateRecord> {
    const created = (await this.model.create(
      [
        {
          ...mandate,
          id: this.ids.generate('transferOrder'),
          status: MandateStatus.ACTIVE,
          lastCollectedAt: null,
          lastAmount: null,
          collections: [],
          cancelledAt: null,
        },
      ] as never[],
      { session: session ?? undefined },
    )) as MandateDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted a mandate insert but returned nothing');
    return toRecord(inserted);
  }

  override async findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<MandateRecord | null> {
    return this.readOne({ id, userId }, session);
  }

  override async findByIdUnscoped(
    id: string,
    session?: ClientSession,
  ): Promise<MandateRecord | null> {
    return this.readOne({ id }, session);
  }

  override async list(query: MandateListQuery): Promise<readonly MandateRecord[]> {
    const documents = await this.model
      .find({
        userId: query.userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.accountId ? { accountId: query.accountId } : {}),
      } as QueryFilter<MandateSchemaClass>)
      .sort({ createdAt: -1, id: -1 })
      .limit(query.limit)
      .exec();

    return documents.map((document) => toRecord(document as MandateDocument));
  }

  override async transition(input: MandateTransition): Promise<MandateRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        { id: input.id, userId: input.userId, status: { $in: [...input.fromStatuses] } },
        {
          $set: {
            status: input.status,
            ...(input.cancelledAt === undefined ? {} : { cancelledAt: input.cancelledAt }),
          },
        },
        { new: true, session: input.session ?? null },
      )
      .exec();

    return document ? toRecord(document as MandateDocument) : null;
  }

  override async recordCollection(input: RecordCollectionInput): Promise<MandateRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        { id: input.mandateId, status: MandateStatus.ACTIVE },
        {
          $set: {
            lastCollectedAt: input.collection.collectedAt,
            lastAmount: input.collection.amount,
            nextExpectedAt: input.nextExpectedAt,
          },
          $push: {
            collections: { $each: [input.collection], $slice: -RETAINED_COLLECTIONS },
          },
        },
        { new: true, session: input.session ?? null },
      )
      .exec();

    return document ? toRecord(document as MandateDocument) : null;
  }

  override async recordRefund(input: RecordRefundInput): Promise<MandateRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        {
          id: input.mandateId,
          collections: {
            $elemMatch: { journalEntryId: input.journalEntryId, refundedAt: null },
          },
        },
        {
          $set: {
            'collections.$.refundedAt': input.refundedAt,
            'collections.$.refundEntryId': input.refundEntryId,
            'collections.$.refundReason': input.refundReason,
          },
        },
        { new: true, session: input.session ?? null },
      )
      .exec();

    return document ? toRecord(document as MandateDocument) : null;
  }

  override async dueForCollection(at: Date, limit: number): Promise<readonly MandateRecord[]> {
    const documents = await this.model
      .find({ status: MandateStatus.ACTIVE, nextExpectedAt: { $ne: null, $lte: at } })
      .sort({ nextExpectedAt: 1 })
      .limit(limit)
      .exec();

    return documents.map((document) => toRecord(document as MandateDocument));
  }

  private async readOne(
    filter: QueryFilter<MandateSchemaClass>,
    session?: ClientSession,
  ): Promise<MandateRecord | null> {
    const document = await this.model
      .findOne(filter)
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as MandateDocument) : null;
  }
}

function toRecord(document: MandateDocument): MandateRecord {
  const plain = document.toObject<MandateSchemaClass>();
  return { ...plain, collections: plain.collections.map((entry) => ({ ...entry })) };
}
