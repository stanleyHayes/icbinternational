import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter } from 'mongoose';

import { BillPaymentStatus } from '@reliance/contracts';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { BILL_PAYMENT_MODEL } from './bill-pay.constants.js';
import { BillPaymentSchemaClass, type BillPaymentDocument } from './bill-payment.schema.js';
import {
  BillPaymentStore,
  type BillPaymentListQuery,
  type BillPaymentRecord,
  type BillPaymentTransition,
  type NewBillPayment,
  type StrandedQuery,
} from './bill-payment.store.js';

/**
 * MongoDB-backed bill-payment persistence.
 *
 * {@link transition} is the whole point of this class. The expected statuses live in the
 * filter, so the read and the write are one atomic operation: a submission job and its own
 * retry cannot both mark a payment `SUBMITTED`, and an acknowledgement arriving after the
 * money has been refunded matches nothing and changes nothing.
 */
@Injectable()
export class BillPaymentRepository extends BillPaymentStore {
  constructor(
    @InjectModel(BILL_PAYMENT_MODEL) private readonly model: Model<BillPaymentSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  override async insert(
    payment: NewBillPayment,
    session?: ClientSession,
  ): Promise<BillPaymentRecord> {
    const draft = {
      ...payment,
      id: this.ids.generate('transferOrder'),
      billerReceipt: null,
      rejection: null,
      failureReason: null,
      settlementEntryId: null,
      reversalEntryId: null,
      feeEntryId: null,
      attempts: 0,
      lastLatencyMs: null,
      submittedAt: null,
      completedAt: null,
    };

    const created = (await this.model.create([draft] as never[], {
      session: session ?? undefined,
    })) as BillPaymentDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted a bill payment insert but returned nothing');
    return toRecord(inserted);
  }

  override async findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<BillPaymentRecord | null> {
    return this.readOne({ id, userId }, session);
  }

  override async findByIdUnscoped(
    id: string,
    session?: ClientSession,
  ): Promise<BillPaymentRecord | null> {
    return this.readOne({ id }, session);
  }

  override async list(query: BillPaymentListQuery): Promise<readonly BillPaymentRecord[]> {
    const documents = await this.model
      .find({
        userId: query.userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.billerId ? { billerId: query.billerId } : {}),
      } as QueryFilter<BillPaymentSchemaClass>)
      .sort({ createdAt: -1, id: -1 })
      .limit(query.limit)
      .exec();

    return documents.map((document) => toRecord(document as BillPaymentDocument));
  }

  override async transition(input: BillPaymentTransition): Promise<BillPaymentRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        { id: input.id, status: { $in: [...input.fromStatuses] } },
        {
          $set: { status: input.status, ...(input.patch ?? {}) },
          ...(input.countAttempt ? { $inc: { attempts: 1 } } : {}),
        },
        { new: true, session: input.session ?? null },
      )
      .exec();

    return document ? toRecord(document as BillPaymentDocument) : null;
  }

  override async dueForSubmission(at: Date, limit: number): Promise<readonly BillPaymentRecord[]> {
    const documents = await this.model
      .find({ status: BillPaymentStatus.PENDING, scheduledFor: { $lte: at } })
      .sort({ scheduledFor: 1 })
      .limit(limit)
      .exec();

    return documents.map((document) => toRecord(document as BillPaymentDocument));
  }

  override async awaitingRefund(input: StrandedQuery): Promise<readonly BillPaymentRecord[]> {
    const documents = await this.model
      .find({
        submittedAt: { $lte: input.before },
        $or: [
          // The biller's answer is recorded and the credit is not there.
          { status: BillPaymentStatus.REJECTED, reversalEntryId: null },
          // No answer was ever recorded. The job died holding the payment.
          { status: BillPaymentStatus.SUBMITTED },
        ],
      } as QueryFilter<BillPaymentSchemaClass>)
      .sort({ submittedAt: 1 })
      .limit(input.limit)
      .exec();

    return documents.map((document) => toRecord(document as BillPaymentDocument));
  }

  private async readOne(
    filter: QueryFilter<BillPaymentSchemaClass>,
    session?: ClientSession,
  ): Promise<BillPaymentRecord | null> {
    const document = await this.model
      .findOne(filter)
      .session(session ?? null)
      .exec();
    return document ? toRecord(document as BillPaymentDocument) : null;
  }
}

function toRecord(document: BillPaymentDocument): BillPaymentRecord {
  const plain = document.toObject<BillPaymentSchemaClass>();
  return { ...plain, topUp: plain.topUp ? { ...plain.topUp } : null };
}
