import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model } from 'mongoose';
import { monotonicFactory } from 'ulid';

import { FeeChargeSchemaClass, type FeeChargeDocument } from './fee-charge.schema.js';
import {
  FeeChargeStore,
  type CurrencyTotal,
  type FeeChargeRecord,
  type NewFeeCharge,
} from './fee-charge.store.js';
import { FEE_CHARGE_MODEL, FEE_ID_PREFIX } from './fees.constants.js';

/**
 * MongoDB-backed fee-charge persistence.
 *
 * Every method is a read or an insert: a recorded charge is a fact, and facts are not
 * edited — a fee that should not have been taken is reversed in the ledger, and this
 * record keeps pointing at the entry that took it.
 */
@Injectable()
export class FeeChargeRepository extends FeeChargeStore {
  /**
   * Local ULID factory because the frozen contracts have no `fee` entity kind for
   * `IdGenerator` to mint. Monotonic, so ids sort chronologically like every other
   * public id in the platform.
   */
  private readonly ulid = monotonicFactory();

  constructor(@InjectModel(FEE_CHARGE_MODEL) private readonly model: Model<FeeChargeSchemaClass>) {
    super();
  }

  override async insert(charge: NewFeeCharge, session?: ClientSession): Promise<FeeChargeRecord> {
    const draft = { ...charge, id: `${FEE_ID_PREFIX}_${this.ulid()}` };

    const created = (await this.model.create([draft] as never[], {
      session: session ?? undefined,
    })) as FeeChargeDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted a fee charge insert but returned nothing');
    return toRecord(inserted);
  }

  override async findByChargeKey(
    chargeKey: string,
    session?: ClientSession,
  ): Promise<FeeChargeRecord | null> {
    const document = await this.model
      .findOne({ chargeKey })
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as FeeChargeDocument) : null;
  }

  override async listByAccount(
    accountId: string,
    session?: ClientSession,
  ): Promise<FeeChargeRecord[]> {
    const documents = await this.model
      .find({ accountId })
      .sort({ chargedAt: -1 })
      .session(session ?? null)
      .exec();
    return documents.map((document) => toRecord(document as FeeChargeDocument));
  }

  override async totalsByCurrency(session?: ClientSession): Promise<CurrencyTotal[]> {
    const documents = await this.model
      .find({}, { amount: 1 })
      .session(session ?? null)
      .lean()
      .exec();

    const totals = new Map<string, bigint>();
    for (const document of documents) {
      const { amount, currency } = document.amount;
      totals.set(currency, (totals.get(currency) ?? 0n) + BigInt(amount));
    }

    return [...totals.entries()].map(([currency, totalMinor]) => ({ currency, totalMinor }));
  }
}

/** Hydrated document to plain record. The record is what leaves the repository. */
export function toRecord(document: FeeChargeDocument): FeeChargeRecord {
  const plain = document.toObject<FeeChargeSchemaClass>();
  return { ...plain, amount: { ...plain.amount } };
}
