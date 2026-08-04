import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { AuthorisationStatus } from '@reliance/contracts';

import { IdGenerator } from '../../../common/ids/id-generator.js';
import { decodeCursor } from '../../../common/pagination/cursor.js';
import { CARD_AUTHORISATION_MODEL, NEWEST_FIRST } from '../card.constants.js';

import { AuthorisationSchemaClass, type AuthorisationDocument } from './authorisation.schema.js';
import {
  AuthorisationStore,
  type AuthorisationPatchInput,
  type AuthorisationQuery,
  type AuthorisationRecord,
  type ClearedQuery,
  type NewAuthorisation,
  type SpendWindowQuery,
} from './authorisation.store.js';

/** Statuses whose amount has been, or still may be, taken from the customer. */
const COUNTS_TOWARDS_SPEND = [AuthorisationStatus.APPROVED, AuthorisationStatus.CAPTURED];

/**
 * MongoDB-backed authorisation persistence.
 *
 * Every mutation runs through {@link patch}, which is conditional on the authorisation's
 * current status. Capture, reversal and expiry all end by giving a hold back, so exactly
 * one of them must be allowed to proceed — and that guarantee is this one guard rather
 * than a lock held somewhere further up.
 */
@Injectable()
export class AuthorisationRepository extends AuthorisationStore {
  constructor(
    @InjectModel(CARD_AUTHORISATION_MODEL)
    private readonly model: Model<AuthorisationSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  override async insert(
    authorisation: NewAuthorisation,
    session?: ClientSession,
  ): Promise<AuthorisationRecord> {
    const draft = { ...authorisation, id: this.ids.generate('authorisation') };
    const created = (await this.model.create([draft] as never[], {
      session: session ?? undefined,
    })) as AuthorisationDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted an authorisation insert but returned nothing');
    return toRecord(inserted);
  }

  override async findById(
    id: string,
    session?: ClientSession,
  ): Promise<AuthorisationRecord | null> {
    const document = await this.model
      .findOne({ id })
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as AuthorisationDocument) : null;
  }

  override async list(query: AuthorisationQuery): Promise<{ records: AuthorisationRecord[] }> {
    const documents = await this.model
      .find(listFilter(query))
      .sort({ authorisedAt: NEWEST_FIRST, id: NEWEST_FIRST })
      // One over the page, so a next page can be proven without a count query.
      .limit(query.limit + 1)
      .exec();

    return { records: documents.map((document) => toRecord(document as AuthorisationDocument)) };
  }

  override async patch(input: AuthorisationPatchInput): Promise<AuthorisationRecord | null> {
    const filter: QueryFilter<AuthorisationSchemaClass> = { id: input.authorisationId };
    if (input.expectedStatuses) filter.status = { $in: [...input.expectedStatuses] };

    const document = await this.model
      .findOneAndUpdate(
        filter,
        { $set: input.fields },
        { new: true, session: input.session ?? null },
      )
      .exec();

    return document ? toRecord(document as AuthorisationDocument) : null;
  }

  override async listInWindow(query: SpendWindowQuery): Promise<AuthorisationRecord[]> {
    const filter: QueryFilter<AuthorisationSchemaClass> = {
      cardId: query.cardId,
      status: { $in: COUNTS_TOWARDS_SPEND },
      authorisedAt: { $gte: query.from },
    };
    if (query.channel) filter.channel = query.channel;

    const documents = await this.model
      .find(filter)
      .session(query.session ?? null)
      .exec();
    return documents.map((document) => toRecord(document as AuthorisationDocument));
  }

  override async listExpired(query: ClearedQuery): Promise<AuthorisationRecord[]> {
    const documents = await this.model
      .find({ status: AuthorisationStatus.APPROVED, expiresAt: { $lte: query.asOf } })
      .sort({ expiresAt: 1 })
      .limit(query.limit)
      .exec();
    return documents.map((document) => toRecord(document as AuthorisationDocument));
  }

  override async listCleared(query: ClearedQuery): Promise<AuthorisationRecord[]> {
    const documents = await this.model
      .find({
        status: AuthorisationStatus.CAPTURED,
        settlementBatchId: null,
        clearedAt: { $ne: null, $lte: query.asOf },
      })
      .sort({ clearedAt: 1 })
      .limit(query.limit)
      .exec();
    return documents.map((document) => toRecord(document as AuthorisationDocument));
  }

  override async listByCard(cardId: string, limit: number): Promise<AuthorisationRecord[]> {
    const documents = await this.model
      .find({ cardId })
      .sort({ authorisedAt: NEWEST_FIRST })
      .limit(limit)
      .exec();
    return documents.map((document) => toRecord(document as AuthorisationDocument));
  }
}

function listFilter(query: AuthorisationQuery): QueryFilter<AuthorisationSchemaClass> {
  const filter: QueryFilter<AuthorisationSchemaClass> = { userId: query.userId };
  if (query.cardId) filter.cardId = query.cardId;
  if (query.status) filter.status = query.status;

  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) filter.authorisedAt = { $lt: new Date(cursor.sortValue) };

  return filter;
}

/** Hydrated document to plain record. The record is what leaves the repository. */
export function toRecord(document: AuthorisationDocument): AuthorisationRecord {
  const plain = document.toObject<AuthorisationSchemaClass>();

  return {
    ...plain,
    amount: { ...plain.amount },
    requestedAmount: { ...plain.requestedAmount },
    originalAmount: plain.originalAmount ? { ...plain.originalAmount } : null,
    capturedAmount: plain.capturedAmount ? { ...plain.capturedAmount } : null,
    refundedAmount: plain.refundedAmount ? { ...plain.refundedAmount } : null,
  };
}
