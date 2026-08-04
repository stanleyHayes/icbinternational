import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model } from 'mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { BaseRepository } from '../../database/base.repository.js';

import { type FileAssetSchemaClass } from './file-asset.schema.js';
import {
  FileAssetStore,
  type FileAssetQuery,
  type FileAssetRecord,
  type NewFileAsset,
} from './file-asset.store.js';
import { FILE_ASSET_MODEL } from './files.constants.js';

/** Mongo-backed file register. */
@Injectable()
export class FileAssetRepository
  extends BaseRepository<FileAssetSchemaClass>
  implements FileAssetStore
{
  constructor(
    @InjectModel(FILE_ASSET_MODEL) model: Model<FileAssetSchemaClass>,
    private readonly ids: IdGenerator,
  ) {
    super(model);
  }

  async insert(asset: NewFileAsset, session?: ClientSession): Promise<FileAssetRecord> {
    const created = await this.create({ ...asset, id: this.ids.generate('document') }, session);
    return toRecord(created.toObject());
  }

  async findOwned(id: string, ownerId: string | null): Promise<FileAssetRecord | null> {
    const found = await this.findOne({ id, ownerId });
    return found ? toRecord(found.toObject()) : null;
  }

  async findAny(id: string): Promise<FileAssetRecord | null> {
    const found = await this.findOne({ id });
    return found ? toRecord(found.toObject()) : null;
  }

  async findByStorageKey(storageKey: string): Promise<FileAssetRecord | null> {
    const found = await this.findOne({ storageKey });
    return found ? toRecord(found.toObject()) : null;
  }

  async list(query: FileAssetQuery): Promise<FileAssetRecord[]> {
    const found = await this.find(
      query.purpose
        ? { ownerId: query.ownerId, purpose: query.purpose }
        : { ownerId: query.ownerId },
      { sort: { createdAt: -1 }, limit: query.limit },
    );
    return found.map((document) => toRecord(document.toObject()));
  }

  async markVerified(id: string, contentType: string, sizeBytes: number): Promise<void> {
    await this.updateById(id, { $set: { verified: true, contentType, sizeBytes } });
  }

  async remove(id: string, ownerId: string | null): Promise<boolean> {
    const result = await this.collection.deleteOne({ id, ownerId }).exec();
    return result.deletedCount > 0;
  }
}

function toRecord(document: FileAssetSchemaClass): FileAssetRecord {
  return {
    id: document.id,
    ownerId: document.ownerId,
    purpose: document.purpose,
    visibility: document.visibility,
    storageKey: document.storageKey,
    fileName: document.fileName,
    contentType: document.contentType,
    sizeBytes: document.sizeBytes,
    checksum: document.checksum,
    publicUrl: document.publicUrl,
    verified: document.verified,
    createdAt: document.createdAt,
  };
}
