import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { FxAlertSchemaClass, type FxAlertDocument } from './fx-alert.schema.js';
import { FxAlertStore, type FxAlertRecord, type NewFxAlert } from './fx-alert.store.js';
import { FX_ALERT_MODEL } from './fx.constants.js';

/** MongoDB-backed rate-alert persistence. */
@Injectable()
export class FxAlertRepository extends FxAlertStore {
  constructor(
    @InjectModel(FX_ALERT_MODEL) private readonly model: Model<FxAlertSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  override async insert(alert: NewFxAlert): Promise<FxAlertRecord> {
    const created = (await this.model.create([
      { ...alert, id: this.ids.generate('alert'), active: true, triggeredAt: null },
    ] as never[])) as FxAlertDocument[];

    const [inserted] = created;
    if (!inserted) throw new Error('Mongo accepted a rate alert insert but returned nothing');
    return toRecord(inserted);
  }

  override async listByUser(userId: string): Promise<readonly FxAlertRecord[]> {
    const documents = await this.model.find({ userId }).sort({ createdAt: -1, id: -1 }).exec();
    return documents.map((document) => toRecord(document as FxAlertDocument));
  }

  override async findById(id: string, userId: string): Promise<FxAlertRecord | null> {
    const document = await this.model.findOne({ id, userId }).exec();
    return document ? toRecord(document as FxAlertDocument) : null;
  }

  override async remove(id: string, userId: string): Promise<FxAlertRecord | null> {
    const document = await this.model.findOneAndDelete({ id, userId }).exec();
    return document ? toRecord(document as FxAlertDocument) : null;
  }

  override async listArmed(limit: number): Promise<readonly FxAlertRecord[]> {
    const documents = await this.model
      .find({ active: true })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();

    return documents.map((document) => toRecord(document as FxAlertDocument));
  }

  override async markTriggered(id: string, at: Date): Promise<FxAlertRecord | null> {
    const document = await this.model
      .findOneAndUpdate(
        { id, active: true },
        { $set: { active: false, triggeredAt: at } },
        { new: true },
      )
      .exec();

    return document ? toRecord(document as FxAlertDocument) : null;
  }
}

function toRecord(document: FxAlertDocument): FxAlertRecord {
  return { ...document.toObject<FxAlertSchemaClass>() };
}
