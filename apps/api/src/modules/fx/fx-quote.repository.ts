import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { FxQuoteSchemaClass, type FxQuoteDocument } from './fx-quote.schema.js';
import {
  FxQuoteStore,
  type ConsumeFxQuoteInput,
  type FxQuoteRecord,
  type NewFxQuote,
} from './fx-quote.store.js';
import { FX_QUOTE_MODEL } from './fx.constants.js';

/**
 * MongoDB-backed FX quote persistence.
 *
 * The interesting method is {@link consume}. Both conditions that make a quote executable
 * — unspent, and inside its window — are expressed in the filter of a single
 * `findOneAndUpdate`, so the check and the claim are one atomic operation. Reading the
 * quote, deciding it is live, and then writing would leave a gap in which the window
 * closes or another request claims it, and the customer's protection against being
 * debited twice at a stale rate would be a race the database was never told about.
 */
@Injectable()
export class FxQuoteRepository extends FxQuoteStore {
  constructor(
    @InjectModel(FX_QUOTE_MODEL) private readonly model: Model<FxQuoteSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  override async insert(quote: NewFxQuote, session?: ClientSession): Promise<FxQuoteRecord> {
    const draft = {
      ...quote,
      id: this.ids.generate('quote'),
      conversionId: null,
      journalEntryId: null,
      executedAt: null,
    };

    const created = (await this.model.create([draft] as never[], {
      session: session ?? undefined,
    })) as FxQuoteDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted an FX quote insert but returned nothing');
    return toRecord(inserted);
  }

  override async findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<FxQuoteRecord | null> {
    return this.readOne({ id, userId }, session);
  }

  override async findByConversion(
    conversionId: string,
    session?: ClientSession,
  ): Promise<FxQuoteRecord | null> {
    return this.readOne({ conversionId }, session);
  }

  override async consume(input: ConsumeFxQuoteInput): Promise<FxQuoteRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        {
          id: input.quoteId,
          userId: input.userId,
          conversionId: null,
          expiresAt: { $gt: input.at },
        },
        {
          $set: {
            conversionId: input.conversionId,
            journalEntryId: input.journalEntryId,
            executedAt: input.at,
          },
        },
        { new: true, session: input.session ?? null },
      )
      .exec();

    return document ? toRecord(document as FxQuoteDocument) : null;
  }

  override async listExecuted(userId: string, limit: number): Promise<readonly FxQuoteRecord[]> {
    const documents = await this.model
      .find({ userId, executedAt: { $ne: null } })
      .sort({ executedAt: -1, id: -1 })
      .limit(limit)
      .exec();

    return documents.map((document) => toRecord(document as FxQuoteDocument));
  }

  private async readOne(
    filter: QueryFilter<FxQuoteSchemaClass>,
    session?: ClientSession,
  ): Promise<FxQuoteRecord | null> {
    const document = await this.model
      .findOne(filter)
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as FxQuoteDocument) : null;
  }
}

/** Hydrated document to plain record. The record is what leaves the repository. */
export function toRecord(document: FxQuoteDocument): FxQuoteRecord {
  return { ...document.toObject<FxQuoteSchemaClass>() };
}
