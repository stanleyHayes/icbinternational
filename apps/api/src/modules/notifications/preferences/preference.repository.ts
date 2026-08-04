import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { BaseRepository } from '../../../database/base.repository.js';
import { PREFERENCE_MODEL } from '../notifications.constants.js';

import { type PreferenceSchemaClass } from './preference.schema.js';
import {
  PreferenceStore,
  type PreferenceRecord,
  type SavePreferenceInput,
} from './preference.store.js';

/** Mongo-backed preference matrix, one document per customer. */
@Injectable()
export class PreferenceRepository
  extends BaseRepository<PreferenceSchemaClass>
  implements PreferenceStore
{
  constructor(@InjectModel(PREFERENCE_MODEL) model: Model<PreferenceSchemaClass>) {
    super(model);
  }

  async findFor(userId: string): Promise<PreferenceRecord | null> {
    const found = await this.findOne({ userId });
    return found ? toRecord(found.toObject()) : null;
  }

  async save(input: SavePreferenceInput): Promise<PreferenceRecord> {
    const saved = await this.collection
      .findOneAndUpdate(
        { userId: input.userId },
        {
          $set: {
            preferences: input.preferences,
            quietHours: input.quietHours,
            timezone: input.timezone,
            digestEnabledCategories: input.digestEnabledCategories,
          },
          $setOnInsert: { userId: input.userId },
        },
        { new: true, upsert: true },
      )
      .exec();

    if (!saved) throw new Error(`Could not save notification preferences for ${input.userId}`);
    return toRecord(saved.toObject());
  }
}

function toRecord(document: PreferenceSchemaClass): PreferenceRecord {
  return {
    userId: document.userId,
    preferences: document.preferences,
    quietHours: document.quietHours,
    timezone: document.timezone,
    digestEnabledCategories: document.digestEnabledCategories,
    updatedAt: document.updatedAt,
  };
}
