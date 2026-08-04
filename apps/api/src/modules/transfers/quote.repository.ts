import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { TransferQuoteSchemaClass, type TransferQuoteDocument } from './quote.schema.js';
import {
  QuoteStore,
  type ConsumeQuoteInput,
  type NewQuote,
  type QuoteRecord,
} from './quote.store.js';
import { QUOTE_RETENTION_DAYS, TRANSFER_QUOTE_MODEL } from './transfer.constants.js';

const HOURS_PER_DAY = 24;
const MILLISECONDS_PER_HOUR = 3_600_000;

/**
 * MongoDB-backed quote persistence.
 *
 * {@link consume} is the only mutation and it is conditional on the quote still being
 * unbound. Everything about a quote that must happen exactly once hangs off that single
 * atomic transition.
 */
@Injectable()
export class QuoteRepository extends QuoteStore {
  constructor(
    @InjectModel(TRANSFER_QUOTE_MODEL) private readonly model: Model<TransferQuoteSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  /**
   * Writes the quote.
   *
   * The majority write concern this depends on is set once in `BASE_SCHEMA_OPTIONS`: a
   * quote is written here and read inside a snapshot transaction a moment later, and
   * anything less than majority is not visible to that read.
   */
  override async insert(quote: NewQuote, session?: ClientSession): Promise<QuoteRecord> {
    const draft = {
      ...quote,
      id: this.ids.generate('quote'),
      consumedByTransferId: null,
      reapAt: reapAtFor(quote.createdAt),
    };

    const created = (await this.model.create([draft] as never[], {
      session: session ?? undefined,
    })) as TransferQuoteDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted a quote insert but returned nothing');
    return toRecord(inserted);
  }

  override async findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<QuoteRecord | null> {
    const document = await this.model
      .findOne({ id, userId })
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as TransferQuoteDocument) : null;
  }

  override async consume(input: ConsumeQuoteInput): Promise<QuoteRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        { id: input.quoteId, consumedByTransferId: null },
        { $set: { consumedByTransferId: input.transferId } },
        { new: true, session: input.session ?? null },
      )
      .exec();

    return document ? toRecord(document as TransferQuoteDocument) : null;
  }
}

/** When the TTL index may delete the row — long after the customer can use it. */
export function reapAtFor(createdAt: Date): Date {
  return new Date(
    createdAt.getTime() + QUOTE_RETENTION_DAYS * HOURS_PER_DAY * MILLISECONDS_PER_HOUR,
  );
}

/** Hydrated document to plain record. The record is what leaves the repository. */
export function toRecord(document: TransferQuoteDocument): QuoteRecord {
  const plain = document.toObject<TransferQuoteSchemaClass>();
  return { ...plain, warnings: [...plain.warnings] };
}
