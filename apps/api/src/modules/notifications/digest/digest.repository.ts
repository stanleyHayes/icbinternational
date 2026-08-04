import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';

import { BaseRepository } from '../../../database/base.repository.js';
import { DIGEST_MODEL } from '../notifications.constants.js';

import { type DigestSchemaClass } from './digest.schema.js';
import { DigestStore, type DigestBucket, type DigestItem } from './digest.store.js';

/** Mongo-backed digest buckets. */
@Injectable()
export class DigestRepository extends BaseRepository<DigestSchemaClass> implements DigestStore {
  constructor(@InjectModel(DIGEST_MODEL) model: Model<DigestSchemaClass>) {
    super(model);
  }

  /**
   * Appends atomically.
   *
   * `$setOnInsert` on `dueAt` is what makes the window start at the *first* item rather
   * than sliding forward with every arrival — a sliding window on a busy account never
   * closes, and the customer never receives the digest at all.
   */
  async append(input: { userId: string; item: DigestItem; dueAt: Date }): Promise<DigestBucket> {
    const saved = await this.collection
      .findOneAndUpdate(
        { userId: input.userId },
        {
          $push: { items: input.item },
          $setOnInsert: { userId: input.userId, dueAt: input.dueAt, openedAt: input.item.at },
        },
        { new: true, upsert: true },
      )
      .exec();

    if (!saved) throw new Error(`Could not append to the digest for ${input.userId}`);
    return toBucket(saved.toObject());
  }

  async findOpen(userId: string): Promise<DigestBucket | null> {
    const found = await this.findOne({ userId });
    return found ? toBucket(found.toObject()) : null;
  }

  async findDue(now: Date, limit: number): Promise<DigestBucket[]> {
    const found = await this.find({ dueAt: { $lte: now } }, { sort: { dueAt: 1 }, limit });
    return found.map((document) => toBucket(document.toObject()));
  }

  async clear(userId: string): Promise<void> {
    await this.collection.deleteOne({ userId }).exec();
  }
}

function toBucket(document: DigestSchemaClass): DigestBucket {
  return {
    userId: document.userId,
    items: document.items,
    dueAt: document.dueAt,
    openedAt: document.openedAt,
  };
}
