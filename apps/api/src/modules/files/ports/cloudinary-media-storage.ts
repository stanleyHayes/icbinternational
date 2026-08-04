/**
 * Cloudinary implementation of {@link MediaStoragePort}.
 *
 * Two delivery types are used deliberately and they are not interchangeable:
 *
 * - `upload` — the default, publicly addressable. Marketing imagery only.
 * - `authenticated` — readable only through a signed URL carrying an expiry. Everything a
 *   customer sends us about who they are goes here. A leaked link from this type is a link
 *   that has already stopped working.
 *
 * The adapter never decides which of the two applies; {@link RESTRICTED_PURPOSES} does,
 * and that decision is made once in `visibilityFor`.
 */

import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppConfigService } from '../../../config/config.service.js';
import { visibilityFor } from '../asset-visibility.js';
import {
  AssetVisibility,
  HEAD_READ_TTL_SECONDS,
  MAX_UPLOAD_BYTES,
  PURPOSE_FOLDER,
  UPLOAD_TICKET_TTL_SECONDS,
  type AssetPurpose,
} from '../files.constants.js';

import {
  MediaStoragePort,
  type DirectUploadInput,
  type MediaTransform,
  type SignedUploadTicket,
  type SignedUrlInput,
  type SignUploadInput,
  type StoredAsset,
} from './media-storage.port.js';

const MILLISECONDS_PER_SECOND = 1000;
const UPLOAD_ENDPOINT_TEMPLATE = 'https://api.cloudinary.com/v1_1/{cloud}/auto/upload';
const AUTHENTICATED_TYPE = 'authenticated';
const PUBLIC_TYPE = 'upload';

/** Chosen so the folder path is stable per owner without exposing the owner's identifier. */
const OWNER_HASH_LENGTH = 16;

@Injectable()
export class CloudinaryMediaStorage extends MediaStoragePort {
  private readonly logger = new Logger(CloudinaryMediaStorage.name);
  readonly configured = true;

  constructor(
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {
    super();
    const media = this.config.media;
    cloudinary.config({
      cloud_name: media.cloudName,
      api_key: media.apiKey,
      api_secret: media.apiSecret,
      secure: true,
    });
  }

  override async signUpload(input: SignUploadInput): Promise<SignedUploadTicket> {
    const media = this.config.media;
    const visibility = visibilityFor(input.purpose);
    const timestamp = Math.floor(this.clock.timestamp() / MILLISECONDS_PER_SECOND);
    const storageKey = this.storageKeyFor(input.fileName);

    const params = {
      folder: this.folderFor(input.purpose, input.ownerRef),
      public_id: storageKey,
      timestamp,
      type: visibility === AssetVisibility.RESTRICTED ? AUTHENTICATED_TYPE : PUBLIC_TYPE,
    };

    const signature = cloudinary.utils.api_sign_request(params, media.apiSecret);

    return {
      uploadUrl: UPLOAD_ENDPOINT_TEMPLATE.replace('{cloud}', media.cloudName),
      fields: {
        api_key: media.apiKey,
        folder: params.folder,
        public_id: params.public_id,
        timestamp: String(timestamp),
        type: params.type,
        signature,
      },
      storageKey: `${params.folder}/${storageKey}`,
      expiresAt: new Date((timestamp + UPLOAD_TICKET_TTL_SECONDS) * MILLISECONDS_PER_SECOND),
      maxBytes: MAX_UPLOAD_BYTES,
    };
  }

  override async upload(input: DirectUploadInput): Promise<StoredAsset> {
    const visibility = visibilityFor(input.purpose);
    const dataUri = `data:${input.contentType};base64,${Buffer.from(input.bytes).toString('base64')}`;

    const response = await cloudinary.uploader.upload(dataUri, {
      folder: this.folderFor(input.purpose, input.ownerRef),
      public_id: this.storageKeyFor(input.fileName),
      resource_type: 'auto',
      type: visibility === AssetVisibility.RESTRICTED ? AUTHENTICATED_TYPE : PUBLIC_TYPE,
      overwrite: false,
    });

    return this.toStoredAsset(response, visibility, input.bytes);
  }

  override async describe(storageKey: string): Promise<StoredAsset | null> {
    try {
      const resource = await cloudinary.api.resource(storageKey, { type: AUTHENTICATED_TYPE });
      return this.toStoredAsset(resource as UploadApiResponse, AssetVisibility.RESTRICTED);
    } catch (error) {
      this.logger.debug(`No restricted asset at ${storageKey}: ${describeError(error)}`);
      return this.describePublic(storageKey);
    }
  }

  /**
   * Reads the head of an object back out of Cloudinary.
   *
   * A `Range` request, so identifying a 15MB passport scan costs 64 bytes. A provider or
   * CDN that ignores the range answers with the whole object, which is why the result is
   * truncated here too rather than trusted to arrive short.
   */
  override async readHead(storageKey: string, byteCount: number): Promise<Uint8Array | null> {
    const url = await this.deliveryUrlFor(storageKey);
    if (!url) return null;

    try {
      const response = await fetch(url, { headers: { Range: `bytes=0-${byteCount - 1}` } });
      if (!response.ok) {
        this.logger.warn(`Could not read the head of ${storageKey}: HTTP ${response.status}`);
        return null;
      }
      return new Uint8Array(await response.arrayBuffer()).subarray(0, byteCount);
    } catch (error) {
      this.logger.warn(`Could not read the head of ${storageKey}: ${describeError(error)}`);
      return null;
    }
  }

  /**
   * Where an object can actually be read from, whichever delivery type it was stored under.
   *
   * A `upload`-type object is not addressable through an `authenticated` signature, so
   * signing one for a profile photo would return a 404 and the upload would be refused for
   * being unreadable rather than for anything wrong with it.
   */
  private async deliveryUrlFor(storageKey: string): Promise<string | null> {
    const stored = await this.describe(storageKey);
    if (!stored) return null;
    if (stored.visibility === AssetVisibility.PUBLIC) return stored.publicUrl;

    return this.signedUrl({
      storageKey,
      ttlSeconds: HEAD_READ_TTL_SECONDS,
      issuedAt: this.clock.now(),
    });
  }

  override async signedUrl(input: SignedUrlInput): Promise<string> {
    const expiresAt = Math.floor(
      (input.issuedAt.getTime() + input.ttlSeconds * MILLISECONDS_PER_SECOND) /
        MILLISECONDS_PER_SECOND,
    );

    if (input.transform) {
      return cloudinary.url(input.storageKey, {
        type: AUTHENTICATED_TYPE,
        sign_url: true,
        secure: true,
        ...toCloudinaryTransform(input.transform),
      });
    }

    return cloudinary.utils.private_download_url(input.storageKey, '', {
      type: AUTHENTICATED_TYPE,
      expires_at: expiresAt,
      attachment: false,
    });
  }

  override async remove(storageKey: string): Promise<boolean> {
    const result = await cloudinary.uploader.destroy(storageKey, { type: AUTHENTICATED_TYPE });
    return result.result === 'ok';
  }

  private async describePublic(storageKey: string): Promise<StoredAsset | null> {
    try {
      const resource = await cloudinary.api.resource(storageKey, { type: PUBLIC_TYPE });
      return this.toStoredAsset(resource as UploadApiResponse, AssetVisibility.PUBLIC);
    } catch {
      return null;
    }
  }

  private folderFor(purpose: AssetPurpose, ownerRef: string): string {
    const owner = createHash('sha256').update(ownerRef).digest('hex').slice(0, OWNER_HASH_LENGTH);
    return `${this.config.media.folder}/${PURPOSE_FOLDER[purpose]}/${owner}`;
  }

  private storageKeyFor(fileName: string): string {
    return createHash('sha256')
      .update(`${fileName}:${this.clock.timestamp()}`)
      .digest('hex')
      .slice(0, OWNER_HASH_LENGTH * 2);
  }

  private toStoredAsset(
    response: UploadApiResponse,
    visibility: AssetVisibility,
    bytes?: Uint8Array,
  ): StoredAsset {
    return {
      storageKey: response.public_id,
      contentType: `${response.resource_type}/${response.format}`,
      sizeBytes: response.bytes,
      visibility,
      publicUrl: visibility === AssetVisibility.PUBLIC ? response.secure_url : null,
      width: response.width ?? null,
      height: response.height ?? null,
      checksum: bytes ? sha256(bytes) : response.etag,
    };
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function toCloudinaryTransform(transform: MediaTransform): Record<string, string | number> {
  const options: Record<string, string | number> = {};
  if (transform.width !== undefined) options.width = transform.width;
  if (transform.height !== undefined) options.height = transform.height;
  if (transform.crop !== undefined) options.crop = transform.crop;
  if (transform.format !== undefined) options.fetch_format = transform.format;
  if (transform.quality !== undefined) options.quality = transform.quality;
  return options;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
