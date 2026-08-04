import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { CardStatus } from '@reliance/contracts';

import { decodeCursor } from '../../common/pagination/cursor.js';

import { CARD_MODEL, NEWEST_FIRST } from './card.constants.js';
import { CardSchemaClass, type CardDocument } from './card.schema.js';
import {
  CardStore,
  type AdminCardQuery,
  type CardPatchInput,
  type CardQuery,
  type CardRecord,
  type ExpiredCardQuery,
  type NewCard,
} from './card.store.js';

/**
 * MongoDB-backed card persistence.
 *
 * {@link patch} is the only mutation and it is conditional. Everything about a card that
 * must happen exactly once — the freeze that beats an authorisation, the report that
 * blocks a stolen card before the thief reaches the till — hangs off that guard.
 */
@Injectable()
export class CardRepository extends CardStore {
  constructor(@InjectModel(CARD_MODEL) private readonly model: Model<CardSchemaClass>) {
    super();
  }

  override async insert(card: NewCard, session?: ClientSession): Promise<CardRecord> {
    const created = (await this.model.create([card] as never[], {
      session: session ?? undefined,
    })) as CardDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted a card insert but returned nothing');
    return toRecord(inserted);
  }

  override async findById(id: string, session?: ClientSession): Promise<CardRecord | null> {
    const document = await this.model
      .findOne({ id })
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as CardDocument) : null;
  }

  override async listByAccount(accountId: string, session?: ClientSession): Promise<CardRecord[]> {
    const documents = await this.model
      .find({ accountId })
      .sort({ orderedAt: NEWEST_FIRST })
      .session(session ?? null)
      .exec();
    return documents.map((document) => toRecord(document as CardDocument));
  }

  override async list(query: CardQuery): Promise<{ records: CardRecord[] }> {
    const documents = await this.model
      .find(listFilter(query))
      .sort({ orderedAt: NEWEST_FIRST, id: NEWEST_FIRST })
      // One over the page, so the caller can prove a next page exists without a count.
      .limit(query.limit + 1)
      .exec();

    return { records: documents.map((document) => toRecord(document as CardDocument)) };
  }

  override async patch(input: CardPatchInput): Promise<CardRecord | null> {
    const filter: QueryFilter<CardSchemaClass> = { id: input.cardId };
    if (input.expectedStatuses) filter.status = { $in: [...input.expectedStatuses] };

    const document = await this.model
      .findOneAndUpdate(
        filter,
        { $set: input.fields },
        { new: true, session: input.session ?? null },
      )
      .exec();

    return document ? toRecord(document as CardDocument) : null;
  }

  override async clearDefault(input: {
    accountId: string;
    exceptCardId: string;
    session?: ClientSession;
  }): Promise<void> {
    await this.model
      .updateMany(
        { accountId: input.accountId, isDefault: true, id: { $ne: input.exceptCardId } },
        { $set: { isDefault: false } },
        { session: input.session ?? undefined },
      )
      .exec();
  }

  override async listAdmin(query: AdminCardQuery): Promise<{ records: CardRecord[] }> {
    const filter: QueryFilter<CardSchemaClass> = query.cursor
      ? ({ id: { $lt: query.cursor } } as QueryFilter<CardSchemaClass>)
      : {};
    const documents = await this.model
      .find(filter)
      .sort({ orderedAt: NEWEST_FIRST, id: NEWEST_FIRST })
      .limit(query.limit + 1)
      .exec();
    return { records: documents.map((document) => toRecord(document as CardDocument)) };
  }

  override async listExpired(query: ExpiredCardQuery): Promise<CardRecord[]> {
    const documents = await this.model
      .find({ expiresAt: { $lte: query.asOf }, status: { $in: EXPIRABLE_STATUSES } })
      .sort({ expiresAt: 1 })
      .limit(query.limit)
      .exec();
    return documents.map((document) => toRecord(document as CardDocument));
  }
}

/** Statuses from which a card can lapse. A cancelled card is already out of circulation. */
const EXPIRABLE_STATUSES: readonly CardStatus[] = [
  CardStatus.ACTIVE,
  CardStatus.INACTIVE,
  CardStatus.FROZEN,
  CardStatus.DELIVERED,
];

function listFilter(query: CardQuery): QueryFilter<CardSchemaClass> {
  const filter: QueryFilter<CardSchemaClass> = { userId: query.userId };
  if (query.accountId) filter.accountId = query.accountId;
  if (query.status) filter.status = query.status;

  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) filter.orderedAt = { $lt: new Date(cursor.sortValue) };

  return filter;
}

/** Hydrated document to plain record. The record is what leaves the repository. */
export function toRecord(document: CardDocument): CardRecord {
  const plain = document.toObject<CardSchemaClass>();

  return {
    ...plain,
    controls: {
      ...plain.controls,
      blockedMccs: [...plain.controls.blockedMccs],
      allowedCountries: [...plain.controls.allowedCountries],
    },
  };
}
