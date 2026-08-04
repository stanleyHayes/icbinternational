import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter, type UpdateQuery } from 'mongoose';

import { AccountStatus } from '@reliance/contracts';

import { toStored } from '../../common/money/money.codec.js';

import { ACCOUNT_MODEL } from './account.constants.js';
import { AccountSchemaClass, type AccountDocument } from './account.schema.js';
import {
  AccountStore,
  type AccountPatchInput,
  type AccountQuery,
  type AccountRecord,
  type BalanceWriteInput,
  type ClearPrimaryInput,
  type DormancyQuery,
  type InsertAccountResult,
  type NewAccount,
  type UniqueAccountField,
} from './account.store.js';

/** Fields a caller never sets and Mongoose fills, plus the counter this module owns. */
const INITIAL_STATE = { version: 0, closedAt: null, dormantAt: null } as const;

const DUPLICATE_KEY_CODE = 11_000;
const IBAN_FIELD = 'iban';

/**
 * MongoDB-backed account persistence.
 *
 * Every write is a `findOneAndUpdate`, never `document.save()`. Two writers touching
 * different fields of the same account — a posting moving a balance and a customer
 * renaming it — must not overwrite each other with their own stale copies of the whole
 * document, and a targeted `$set` is the only way to guarantee that.
 *
 * Balance writes go further and are conditional on `version`. Inside a transaction Mongo
 * would already abort the loser of a concurrent write with a `WriteConflict`, but the
 * guard also covers the case where a caller has held a record across an `await` and the
 * world moved underneath it.
 */
@Injectable()
export class AccountRepository extends AccountStore {
  constructor(@InjectModel(ACCOUNT_MODEL) private readonly model: Model<AccountSchemaClass>) {
    super();
  }

  override async insert(
    account: NewAccount,
    session?: ClientSession,
  ): Promise<InsertAccountResult> {
    const draft = { ...account, ...INITIAL_STATE, lastActivityAt: account.openedAt };

    try {
      // `create()`'s overloads cannot express a partial of the raw document type when the
      // source carries `readonly` arrays, so the cast is the same one `BaseRepository`
      // makes; the shape is guaranteed by `NewAccount` on the way in.
      const created = (await this.model.create([draft] as never[], {
        session: session ?? undefined,
      })) as AccountDocument[];

      const [inserted] = created;
      if (!inserted) throw new Error('Mongo accepted an account insert but returned nothing');
      return { account: toRecord(inserted) };
    } catch (error) {
      const conflictOn = duplicateKeyField(error);
      if (!conflictOn) throw error;
      return { conflictOn };
    }
  }

  override async findById(id: string, session?: ClientSession): Promise<AccountRecord | null> {
    return this.findOne({ id }, session);
  }

  override async findByNumber(
    number: string,
    session?: ClientSession,
  ): Promise<AccountRecord | null> {
    return this.findOne({ number }, session);
  }

  override async findByIban(iban: string, session?: ClientSession): Promise<AccountRecord | null> {
    return this.findOne({ iban }, session);
  }

  /**
   * A customer's accounts, including any they merely co-hold.
   *
   * `$or` over `userId` and `holderIds` rather than `holderIds` alone so that the index
   * on `userId` still serves the overwhelmingly common single-holder read.
   */
  override async listByUser(query: AccountQuery): Promise<AccountRecord[]> {
    const filter: QueryFilter<AccountSchemaClass> = {
      $or: [{ userId: query.userId }, { holderIds: query.userId }],
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
    };

    const documents = await this.model
      .find(filter)
      .sort({ openedAt: -1 })
      .session(query.session ?? null)
      .exec();

    return documents.map((document) => toRecord(document as AccountDocument));
  }

  override async listDormancyCandidates(query: DormancyQuery): Promise<AccountRecord[]> {
    const documents = await this.model
      .find({ status: AccountStatus.ACTIVE, lastActivityAt: { $lt: query.quietSince } })
      .sort({ lastActivityAt: 1 })
      .limit(query.limit)
      .session(query.session ?? null)
      .exec();

    return documents.map((document) => toRecord(document as AccountDocument));
  }

  override async writeBalances(input: BalanceWriteInput): Promise<boolean> {
    const result = await this.model
      .updateOne(
        { id: input.accountId, version: input.expectedVersion },
        {
          $set: {
            ledgerBalance: toStored(input.ledgerBalance),
            availableBalance: toStored(input.availableBalance),
            holdTotal: toStored(input.holdTotal),
            ...(input.status ? { status: input.status } : {}),
            ...(input.dormantAt === undefined ? {} : { dormantAt: input.dormantAt }),
            ...(input.lastActivityAt ? { lastActivityAt: input.lastActivityAt } : {}),
          },
          $inc: { version: 1 },
        },
        { session: input.session },
      )
      .exec();

    return result.matchedCount > 0;
  }

  override async patch(input: AccountPatchInput): Promise<AccountRecord | null> {
    const { overdraftLimit, ...plain } = input.fields;
    const update: UpdateQuery<AccountSchemaClass> = {
      $set: {
        ...plain,
        ...(overdraftLimit ? { overdraftLimit: toStored(overdraftLimit) } : {}),
      },
      $inc: { version: 1 },
    };

    const document = await this.model
      .findOneAndUpdate(versionedFilter(input), update, {
        new: true,
        session: input.session ?? null,
      })
      .exec();

    return document ? toRecord(document as AccountDocument) : null;
  }

  override async clearPrimary(input: ClearPrimaryInput): Promise<void> {
    await this.model
      .updateMany(
        {
          userId: input.userId,
          currency: input.currency,
          isPrimary: true,
          id: { $ne: input.exceptAccountId },
        },
        { $set: { isPrimary: false }, $inc: { version: 1 } },
        { session: input.session ?? undefined },
      )
      .exec();
  }

  private async findOne(
    filter: QueryFilter<AccountSchemaClass>,
    session?: ClientSession,
  ): Promise<AccountRecord | null> {
    const document = await this.model
      .findOne(filter)
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as AccountDocument) : null;
  }
}

function versionedFilter(input: AccountPatchInput): QueryFilter<AccountSchemaClass> {
  return input.expectedVersion === undefined
    ? { id: input.accountId }
    : { id: input.accountId, version: input.expectedVersion };
}

/** Hydrated document to plain record. The record is what leaves the repository. */
export function toRecord(document: AccountDocument): AccountRecord {
  const plain = document.toObject<AccountSchemaClass>();
  return {
    ...plain,
    holderIds: [...plain.holderIds],
    ledgerBalance: { ...plain.ledgerBalance },
    availableBalance: { ...plain.availableBalance },
    holdTotal: { ...plain.holdTotal },
    overdraftLimit: { ...plain.overdraftLimit },
    minimumOpeningBalance: { ...plain.minimumOpeningBalance },
  };
}

/**
 * Identifies which unique index a write violated.
 *
 * MongoDB reports every unique-index violation as 11000 and names the offending index in
 * `keyPattern`, which is what lets account opening regenerate the one identifier that
 * actually collided instead of starting over.
 */
function duplicateKeyField(error: unknown): UniqueAccountField | null {
  if (typeof error !== 'object' || error === null) return null;
  if ((error as { code?: unknown }).code !== DUPLICATE_KEY_CODE) return null;

  const pattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  return IBAN_FIELD in pattern ? IBAN_FIELD : 'number';
}
