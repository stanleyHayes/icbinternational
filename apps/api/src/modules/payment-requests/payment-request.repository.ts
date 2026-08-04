import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model } from 'mongoose';

import { PaymentRequestStatus } from '@reliance/contracts';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { PAYMENT_REQUEST_MODEL } from './payment-request.constants.js';
import {
  PaymentRequestSchemaClass,
  type PaymentRequestDocument,
} from './payment-request.schema.js';
import {
  PaymentRequestStore,
  type NewPaymentRequest,
  type PaymentRequestRecord,
  type PaymentRequestTransition,
} from './payment-request.store.js';

/**
 * MongoDB-backed payment-request persistence.
 *
 * {@link transition} carries the whole lifecycle. Paying, declining, cancelling and expiring
 * are all conditional writes from a known set of statuses, so the four of them race safely
 * against each other: a request that expires while the payer is authorising matches nothing,
 * the payment is refused, and nobody is charged for a request that had already lapsed.
 */
@Injectable()
export class PaymentRequestRepository extends PaymentRequestStore {
  constructor(
    @InjectModel(PAYMENT_REQUEST_MODEL)
    private readonly model: Model<PaymentRequestSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  override async insert(
    request: NewPaymentRequest,
    session?: ClientSession,
  ): Promise<PaymentRequestRecord> {
    const created = (await this.model.create(
      [
        {
          ...request,
          id: this.ids.generate('transferOrder'),
          status: PaymentRequestStatus.OPEN,
          paidByUserId: null,
          paidByName: null,
          paidFromAccountId: null,
          journalEntryId: null,
          nudgeCount: 0,
          lastNudgedAt: null,
          paidAt: null,
        },
      ] as never[],
      { session: session ?? undefined },
    )) as PaymentRequestDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted a payment request but returned nothing');
    return toRecord(inserted);
  }

  override async findById(
    id: string,
    session?: ClientSession,
  ): Promise<PaymentRequestRecord | null> {
    const document = await this.model
      .findOne({ id })
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as PaymentRequestDocument) : null;
  }

  override async listByRequester(
    userId: string,
    limit: number,
  ): Promise<readonly PaymentRequestRecord[]> {
    const documents = await this.model
      .find({ userId })
      .sort({ createdAt: -1, id: -1 })
      .limit(limit)
      .exec();

    return documents.map((document) => toRecord(document as PaymentRequestDocument));
  }

  override async listBySplit(splitId: string): Promise<readonly PaymentRequestRecord[]> {
    const documents = await this.model.find({ splitId }).sort({ createdAt: 1 }).exec();
    return documents.map((document) => toRecord(document as PaymentRequestDocument));
  }

  override async transition(input: PaymentRequestTransition): Promise<PaymentRequestRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        {
          id: input.id,
          status: { $in: [...input.fromStatuses] },
          ...(input.liveAt ? { expiresAt: { $gt: input.liveAt } } : {}),
        },
        {
          $set: {
            status: input.status,
            ...(input.patch ?? {}),
            ...(input.nudgedAt ? { lastNudgedAt: input.nudgedAt } : {}),
          },
          ...(input.nudgedAt ? { $inc: { nudgeCount: 1 } } : {}),
        },
        { new: true, session: input.session ?? null },
      )
      .exec();

    return document ? toRecord(document as PaymentRequestDocument) : null;
  }

  override async listLapsed(at: Date, limit: number): Promise<readonly PaymentRequestRecord[]> {
    const documents = await this.model
      .find({ status: PaymentRequestStatus.OPEN, expiresAt: { $lte: at } })
      .sort({ expiresAt: 1 })
      .limit(limit)
      .exec();

    return documents.map((document) => toRecord(document as PaymentRequestDocument));
  }
}

function toRecord(document: PaymentRequestDocument): PaymentRequestRecord {
  return { ...document.toObject<PaymentRequestSchemaClass>() };
}
