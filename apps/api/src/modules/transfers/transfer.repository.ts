import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';

import { TRANSFER_MODEL } from './transfer.constants.js';
import { TransferSchemaClass, type TransferDocument } from './transfer.schema.js';
import {
  TransferStore,
  type NewTransfer,
  type TransferListQuery,
  type TransferRecord,
  type TransferTransitionInput,
} from './transfer.store.js';

/**
 * MongoDB-backed transfer persistence.
 *
 * Reads are scoped by `userId` inside the filter rather than checked afterwards, so there
 * is no query here capable of returning another customer's payment to be checked at all.
 *
 * Paging is keyset, cursored on `(createdAt, id)`. An offset would repeat or skip rows on
 * a list the customer is actively adding to, which is the normal state of a transfer feed.
 */
@Injectable()
export class TransferRepository extends TransferStore {
  constructor(
    @InjectModel(TRANSFER_MODEL) private readonly model: Model<TransferSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  override async insert(transfer: NewTransfer, session?: ClientSession): Promise<TransferRecord> {
    const draft = {
      ...transfer,
      id: this.ids.generate('transfer'),
      railReference: null,
      returnCode: null,
      returnReason: null,
    };

    const created = (await this.model.create([draft] as never[], {
      session: session ?? undefined,
    })) as TransferDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted a transfer insert but returned nothing');
    return toRecord(inserted);
  }

  override async findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<TransferRecord | null> {
    return this.readOne({ id, userId }, session);
  }

  override async findByQuote(
    quoteId: string,
    session?: ClientSession,
  ): Promise<TransferRecord | null> {
    return this.readOne({ quoteId }, session);
  }

  override async list(query: TransferListQuery): Promise<PageResult<TransferRecord>> {
    const documents = await this.model
      .find(listFilter(query))
      .sort({ createdAt: -1, id: -1 })
      // One more than asked for, so `hasMore` is answered without a second count query.
      .limit(query.limit + 1)
      .session(query.session ?? null)
      .exec();

    return buildPage({
      records: documents.map((document) => toRecord(document as TransferDocument)),
      limit: query.limit,
      toCursor: (record) => ({ sortValue: record.createdAt.toISOString(), id: record.id }),
    });
  }

  override async transition(input: TransferTransitionInput): Promise<TransferRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        { id: input.id, userId: input.userId, status: { $in: [...input.fromStatuses] } },
        {
          $set: {
            status: input.status,
            ...(input.settledAt === undefined ? {} : { settledAt: input.settledAt }),
          },
          $push: { timeline: input.event },
        },
        { new: true, session: input.session ?? null },
      )
      .exec();

    return document ? toRecord(document as TransferDocument) : null;
  }

  private async readOne(
    filter: QueryFilter<TransferSchemaClass>,
    session?: ClientSession,
  ): Promise<TransferRecord | null> {
    const document = await this.model
      .findOne(filter)
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as TransferDocument) : null;
  }
}

/** Owner scope, the contract's optional filters, and the keyset bound from the cursor. */
function listFilter(query: TransferListQuery): QueryFilter<TransferSchemaClass> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;

  return {
    userId: query.userId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.rail ? { rail: query.rail } : {}),
    ...(query.sourceAccountId ? { sourceAccountId: query.sourceAccountId } : {}),
    ...(cursor
      ? {
          $or: [
            { createdAt: { $lt: new Date(cursor.sortValue) } },
            { createdAt: new Date(cursor.sortValue), id: { $lt: cursor.id } },
          ],
        }
      : {}),
  } as QueryFilter<TransferSchemaClass>;
}

/** Hydrated document to plain record. The record is what leaves the repository. */
export function toRecord(document: TransferDocument): TransferRecord {
  const plain = document.toObject<TransferSchemaClass>();

  return {
    ...plain,
    timeline: plain.timeline.map((event) => ({ ...event })),
    metadata: { ...plain.metadata },
  };
}
