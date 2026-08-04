/**
 * The file register: storing bytes the bank itself produced, and handing out links that
 * expire.
 *
 * The browser-upload handshake lives next door in {@link UploadHandshakeService}, because
 * confirming an upload nobody here has seen is a different problem from storing bytes the
 * API is already holding: the first has to establish what was stored and who is entitled
 * to claim it, the second already knows both.
 */

import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/config.service.js';

import { FileAssetStore, type FileAssetRecord } from './file-asset.store.js';
import {
  AssetVisibility,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  MAX_UPLOAD_BYTES,
  type AssetPurpose,
} from './files.constants.js';
import { discardQuietly } from './media-cleanup.js';
import { MediaStoragePort, type MediaTransform } from './ports/media-storage.port.js';
import { assessUpload, describeAllowed } from './upload-policy.js';

/** How many of a customer's assets a list call will return. */
const LIST_LIMIT = 100;

export interface StoreBytesCommand {
  readonly ownerId: string | null;
  readonly purpose: AssetPurpose;
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly assets: FileAssetStore,
    private readonly storage: MediaStoragePort,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
  ) {}

  /** Uploads bytes the API already holds — a generated statement, a rendered receipt. */
  async storeBytes(command: StoreBytesCommand): Promise<FileAssetRecord> {
    const verdict = assessUpload({
      purpose: command.purpose,
      bytes: command.bytes,
      sizeBytes: command.bytes.byteLength,
    });

    if (!verdict.accepted) {
      throw new AppError({
        code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        message: verdict.reason,
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      });
    }

    const stored = await this.storage.upload({
      purpose: command.purpose,
      ownerRef: command.ownerId ?? 'bank',
      fileName: command.fileName,
      contentType: verdict.contentType,
      bytes: command.bytes,
    });

    return this.assets.insert({
      ownerId: command.ownerId,
      purpose: command.purpose,
      visibility: stored.visibility,
      storageKey: stored.storageKey,
      fileName: command.fileName,
      contentType: verdict.contentType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      publicUrl: stored.publicUrl,
      verified: true,
    });
  }

  /**
   * A link to the asset that stops working.
   *
   * A public asset answers with its permanent address; anything restricted is signed
   * fresh on every call and never cached, so revoking access is a matter of not signing
   * it again rather than chasing a URL that has already escaped.
   */
  async linkFor(asset: FileAssetRecord, transform?: MediaTransform): Promise<string> {
    if (asset.visibility === AssetVisibility.PUBLIC && asset.publicUrl) return asset.publicUrl;

    return this.storage.signedUrl({
      storageKey: asset.storageKey,
      ttlSeconds: this.config.media.signedUrlTtlSeconds || DEFAULT_SIGNED_URL_TTL_SECONDS,
      issuedAt: this.clock.now(),
      ...(transform ? { transform } : {}),
    });
  }

  /** Owner-scoped read. Staff surfaces use {@link getForStaff}. */
  async get(id: string, ownerId: string): Promise<FileAssetRecord> {
    const asset = await this.assets.findOwned(id, ownerId);
    if (!asset) throw AppError.notFound('Document', id);
    return asset;
  }

  async getForStaff(id: string): Promise<FileAssetRecord> {
    const asset = await this.assets.findAny(id);
    if (!asset) throw AppError.notFound('Document', id);
    return asset;
  }

  async list(ownerId: string, purpose?: AssetPurpose): Promise<FileAssetRecord[]> {
    return this.assets.list({ ownerId, limit: LIST_LIMIT, ...(purpose ? { purpose } : {}) });
  }

  async remove(id: string, ownerId: string): Promise<void> {
    const asset = await this.get(id, ownerId);
    await discardQuietly(this.storage, asset.storageKey, this.logger);
    await this.assets.remove(id, ownerId);
  }

  /** What a customer may upload here, phrased for a form's help text. */
  describeAccepted(purpose: AssetPurpose): { formats: string; maxBytes: number } {
    return { formats: describeAllowed(purpose), maxBytes: MAX_UPLOAD_BYTES };
  }
}
