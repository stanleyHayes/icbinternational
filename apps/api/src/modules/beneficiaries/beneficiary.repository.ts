import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { BENEFICIARY_MODEL } from './beneficiary.constants.js';
import { BeneficiarySchemaClass, type BeneficiaryDocument } from './beneficiary.schema.js';
import {
  BeneficiaryStore,
  type BeneficiaryPatchInput,
  type BeneficiaryQuery,
  type BeneficiaryRecord,
  type NewBeneficiary,
  type TouchBeneficiaryInput,
} from './beneficiary.store.js';

/** Duplicate-key error code, raised by the unique index on `{userId, matchKeys}`. */
const DUPLICATE_KEY_CODE = 11_000;

/**
 * MongoDB-backed payee persistence.
 *
 * Every read is scoped by `userId` inside the filter rather than checked after the fact.
 * A payee list is a map of who a customer pays, and the failure mode of an ownership check
 * that runs *after* the query is that somebody forgets it once — so there is no query here
 * that can return another customer's row to be checked at all.
 */
@Injectable()
export class BeneficiaryRepository extends BeneficiaryStore {
  constructor(
    @InjectModel(BENEFICIARY_MODEL) private readonly model: Model<BeneficiarySchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  override async insert(
    beneficiary: NewBeneficiary,
    session?: ClientSession,
  ): Promise<BeneficiaryRecord> {
    const draft = { ...beneficiary, id: this.ids.generate('beneficiary'), lastUsedAt: null };

    try {
      const created = (await this.model.create([draft] as never[], {
        session: session ?? undefined,
      })) as BeneficiaryDocument[];

      const [inserted] = created;
      if (!inserted) throw new Error('Mongo accepted a beneficiary insert but returned nothing');
      return toRecord(inserted);
    } catch (error) {
      return this.recoverFromDuplicate(beneficiary, error, session);
    }
  }

  override async findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<BeneficiaryRecord | null> {
    const document = await this.model
      .findOne({ id, userId })
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as BeneficiaryDocument) : null;
  }

  override async listByUser(query: BeneficiaryQuery): Promise<BeneficiaryRecord[]> {
    const documents = await this.model
      .find({
        userId: query.userId,
        ...(query.favouritesOnly ? { isFavourite: true } : {}),
      })
      .sort({ isFavourite: -1, lastUsedAt: -1, createdAt: -1 })
      .session(query.session ?? null)
      .exec();

    return documents.map((document) => toRecord(document as BeneficiaryDocument));
  }

  override async findByKeys(
    userId: string,
    keys: readonly string[],
    session?: ClientSession,
  ): Promise<BeneficiaryRecord | null> {
    if (keys.length === 0) return null;

    const document = await this.model
      .findOne({ userId, matchKeys: { $in: [...keys] } })
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as BeneficiaryDocument) : null;
  }

  override async count(userId: string, session?: ClientSession): Promise<number> {
    return this.model
      .countDocuments({ userId })
      .session(session ?? null)
      .exec();
  }

  override async patch(input: BeneficiaryPatchInput): Promise<BeneficiaryRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        { id: input.id, userId: input.userId },
        { $set: input.fields },
        {
          new: true,
          session: input.session ?? null,
        },
      )
      .exec();

    return document ? toRecord(document as BeneficiaryDocument) : null;
  }

  override async touch(input: TouchBeneficiaryInput): Promise<void> {
    await this.model
      .updateOne(
        { id: input.id },
        { $set: { lastUsedAt: input.usedAt } },
        {
          session: input.session ?? undefined,
        },
      )
      .exec();
  }

  override async remove(id: string, userId: string, session?: ClientSession): Promise<boolean> {
    const result = await this.model
      .deleteOne({ id, userId }, { session: session ?? undefined })
      .exec();
    return result.deletedCount > 0;
  }

  /**
   * Turns a lost race into the winner's record.
   *
   * Two taps on "save payee" both pass any pre-read and the unique index rejects the
   * second. Re-reading the keys yields the record that did land, which is exactly what the
   * customer asked for — and returning it, rather than a `CONFLICT`, keeps the cooling-off
   * clock anchored to the first save instead of the retry.
   */
  private async recoverFromDuplicate(
    beneficiary: NewBeneficiary,
    error: unknown,
    session?: ClientSession,
  ): Promise<BeneficiaryRecord> {
    if (!isDuplicateKeyError(error)) throw error;

    const winner = await this.findByKeys(beneficiary.userId, beneficiary.matchKeys, session);
    if (!winner) throw error;
    return winner;
  }
}

/** Hydrated document to plain record. The record is what leaves the repository. */
export function toRecord(document: BeneficiaryDocument): BeneficiaryRecord {
  const plain = document.toObject<BeneficiarySchemaClass>();
  return { ...plain, matchKeys: [...plain.matchKeys] };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_CODE
  );
}
