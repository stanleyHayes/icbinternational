import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { IdGenerator } from '../../common/ids/id-generator.js';

import {
  FileAssetStore,
  type FileAssetQuery,
  type FileAssetRecord,
  type NewFileAsset,
} from './file-asset.store.js';

/**
 * In-process file register.
 *
 * Enforces the same `storageKey` uniqueness the Mongo index does and the same owner
 * scoping the repository's filters do, so a test that reaches another customer's document
 * here would reach it in production too.
 */
@Injectable()
export class InMemoryFileAssetStore extends FileAssetStore {
  private readonly byId = new Map<string, FileAssetRecord>();

  constructor(
    private readonly ids: IdGenerator = new IdGenerator(),
    private readonly clock: ClockService = new ClockService(),
  ) {
    super();
  }

  override async insert(asset: NewFileAsset): Promise<FileAssetRecord> {
    const existing = await this.findByStorageKey(asset.storageKey);
    if (existing) return existing;

    const record: FileAssetRecord = {
      ...asset,
      id: this.ids.generate('document'),
      createdAt: this.clock.now(),
    };
    this.byId.set(record.id, record);
    return record;
  }

  override async findOwned(id: string, ownerId: string | null): Promise<FileAssetRecord | null> {
    const record = this.byId.get(id);
    return record && record.ownerId === ownerId ? record : null;
  }

  override async findAny(id: string): Promise<FileAssetRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async findByStorageKey(storageKey: string): Promise<FileAssetRecord | null> {
    return [...this.byId.values()].find((record) => record.storageKey === storageKey) ?? null;
  }

  override async list(query: FileAssetQuery): Promise<FileAssetRecord[]> {
    return [...this.byId.values()]
      .filter((record) => record.ownerId === query.ownerId)
      .filter((record) => !query.purpose || record.purpose === query.purpose)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, query.limit);
  }

  override async markVerified(id: string, contentType: string, sizeBytes: number): Promise<void> {
    const record = this.byId.get(id);
    if (!record) return;
    this.byId.set(id, { ...record, verified: true, contentType, sizeBytes });
  }

  override async remove(id: string, ownerId: string | null): Promise<boolean> {
    const record = this.byId.get(id);
    if (!record || record.ownerId !== ownerId) return false;
    return this.byId.delete(id);
  }
}
