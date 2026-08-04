import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model } from 'mongoose';

import { HoldStatus } from '@reliance/contracts';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { HOLD_MODEL } from './hold.constants.js';
import { HoldSchemaClass, type HoldDocument } from './hold.schema.js';
import {
  HoldStore,
  type ExpiredHoldQuery,
  type HoldRecord,
  type NewHold,
  type ResolveHoldInput,
} from './hold.store.js';

/**
 * MongoDB-backed hold persistence.
 *
 * {@link resolve} is the only mutation, and it is conditional on the hold still being
 * `ACTIVE`. Everything about a hold's lifecycle that has to happen exactly once — giving
 * the reserve back, booking the capture — hangs off that one atomic transition.
 */
@Injectable()
export class HoldRepository extends HoldStore {
  constructor(
    @InjectModel(HOLD_MODEL) private readonly model: Model<HoldSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  override async insert(hold: NewHold, session?: ClientSession): Promise<HoldRecord> {
    const draft = {
      ...hold,
      id: this.ids.generate('hold'),
      status: HoldStatus.ACTIVE,
      resolvedAt: null,
      capturedAmount: null,
      capturedEntryId: null,
    };

    const created = (await this.model.create([draft] as never[], {
      session: session ?? undefined,
    })) as HoldDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted a hold insert but returned nothing');
    return toRecord(inserted);
  }

  override async findById(id: string, session?: ClientSession): Promise<HoldRecord | null> {
    const document = await this.model
      .findOne({ id })
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as HoldDocument) : null;
  }

  override async listActive(accountId: string, session?: ClientSession): Promise<HoldRecord[]> {
    const documents = await this.model
      .find({ accountId, status: HoldStatus.ACTIVE })
      .sort({ placedAt: -1 })
      .session(session ?? null)
      .exec();
    return documents.map((document) => toRecord(document as HoldDocument));
  }

  override async resolve(input: ResolveHoldInput): Promise<HoldRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        { id: input.holdId, status: HoldStatus.ACTIVE },
        {
          $set: {
            status: input.status,
            resolvedAt: input.resolvedAt,
            ...(input.capturedAmount ? { capturedAmount: input.capturedAmount } : {}),
            ...(input.capturedEntryId ? { capturedEntryId: input.capturedEntryId } : {}),
          },
        },
        { new: true, session: input.session ?? null },
      )
      .exec();

    return document ? toRecord(document as HoldDocument) : null;
  }

  override async listExpired(query: ExpiredHoldQuery): Promise<HoldRecord[]> {
    const documents = await this.model
      .find({ status: HoldStatus.ACTIVE, expiresAt: { $ne: null, $lte: query.asOf } })
      .sort({ expiresAt: 1 })
      .limit(query.limit)
      .session(query.session ?? null)
      .exec();
    return documents.map((document) => toRecord(document as HoldDocument));
  }
}

/** Hydrated document to plain record. The record is what leaves the repository. */
export function toRecord(document: HoldDocument): HoldRecord {
  const plain = document.toObject<HoldSchemaClass>();
  return {
    ...plain,
    amount: { ...plain.amount },
    capturedAmount: plain.capturedAmount ? { ...plain.capturedAmount } : null,
  };
}
