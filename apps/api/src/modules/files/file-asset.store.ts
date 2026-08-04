/**
 * Persistence boundary for the file register.
 *
 * The register is the bank's record of what was uploaded, by whom, and what the bytes
 * actually turned out to be. It is deliberately separate from the object store: the
 * provider knows where a blob lives, and this knows whether we are allowed to serve it.
 */

import { type ClientSession } from 'mongoose';

import { type AssetPurpose, type AssetVisibility } from './files.constants.js';

/** A registered asset as services see it — a plain value, with no `.save()` on it. */
export interface FileAssetRecord {
  /** Public id, `doc_…`. */
  readonly id: string;
  /** Owning customer, or `null` for content media owned by the bank itself. */
  readonly ownerId: string | null;
  readonly purpose: AssetPurpose;
  readonly visibility: AssetVisibility;
  readonly storageKey: string;
  readonly fileName: string;
  /** The type the bytes proved to be, not the type the uploader claimed. */
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly publicUrl: string | null;
  /** False until the bytes have been fetched back and identified. */
  readonly verified: boolean;
  readonly createdAt: Date;
}

export type NewFileAsset = Omit<FileAssetRecord, 'id' | 'createdAt'>;

export interface FileAssetQuery {
  readonly ownerId: string;
  readonly purpose?: AssetPurpose;
  readonly limit: number;
}

export abstract class FileAssetStore {
  abstract insert(asset: NewFileAsset, session?: ClientSession): Promise<FileAssetRecord>;

  /** Owner-scoped read. Passing the owner is how another customer's file stays unreachable. */
  abstract findOwned(id: string, ownerId: string | null): Promise<FileAssetRecord | null>;

  /** Unscoped read, for the staff surfaces that legitimately review any customer's document. */
  abstract findAny(id: string): Promise<FileAssetRecord | null>;

  abstract findByStorageKey(storageKey: string): Promise<FileAssetRecord | null>;

  abstract list(query: FileAssetQuery): Promise<FileAssetRecord[]>;

  abstract markVerified(id: string, contentType: string, sizeBytes: number): Promise<void>;

  abstract remove(id: string, ownerId: string | null): Promise<boolean>;
}
