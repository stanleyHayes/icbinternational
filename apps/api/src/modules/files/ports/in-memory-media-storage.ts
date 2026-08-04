/**
 * An in-process {@link MediaStoragePort}.
 *
 * Used by the test suite, and used in earnest whenever Cloudinary is unconfigured — the
 * API is required to boot and function without a media provider, and silently disabling
 * uploads would turn a missing environment variable into a customer-visible defect.
 *
 * It is honest about the boundary it stands in for: a restricted asset gets no public URL
 * here either, and a signed URL carries a real expiry that {@link verifySignedUrl} checks.
 * A test that passes against this twin is testing the rule, not the twin's leniency.
 */

import { createHmac, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ClockService } from '../../../common/clock/clock.service.js';
import { visibilityFor } from '../asset-visibility.js';
import {
  AssetVisibility,
  MAX_UPLOAD_BYTES,
  PURPOSE_FOLDER,
  UPLOAD_TICKET_TTL_SECONDS,
  type AssetPurpose,
} from '../files.constants.js';

import { sha256 } from './cloudinary-media-storage.js';
import {
  MediaStoragePort,
  type DirectUploadInput,
  type SignedUploadTicket,
  type SignedUrlInput,
  type SignUploadInput,
  type StoredAsset,
} from './media-storage.port.js';

const MILLISECONDS_PER_SECOND = 1000;
const LOCAL_BASE_URL = 'https://media.reliancebank.example';
const SIGNATURE_LENGTH = 32;
const KEY_ENTROPY_BYTES = 12;
/** What a provider reports for bytes it has not been told anything about. */
const OPAQUE_CONTENT_TYPE = 'application/octet-stream';

interface StoredObject {
  readonly asset: StoredAsset;
  readonly bytes: Uint8Array;
}

/** An object arriving at a key by the route the API cannot see: the browser's upload. */
export interface PlacedObject {
  readonly storageKey: string;
  readonly bytes: Uint8Array;
  readonly purpose: AssetPurpose;
  /** Overrides the byte length, for exercising an object larger than anyone will read. */
  readonly sizeBytes?: number;
  readonly contentType?: string;
}

@Injectable()
export class InMemoryMediaStorage extends MediaStoragePort {
  readonly configured = false;

  private readonly objects = new Map<string, StoredObject>();
  private readonly signingKey = randomBytes(SIGNATURE_LENGTH);

  constructor(private readonly clock: ClockService = new ClockService()) {
    super();
  }

  override async signUpload(input: SignUploadInput): Promise<SignedUploadTicket> {
    const storageKey = this.keyFor(input);
    const expiresAtSeconds = toSeconds(
      this.clock.timestamp() + UPLOAD_TICKET_TTL_SECONDS * MILLISECONDS_PER_SECOND,
    );

    return {
      uploadUrl: `${LOCAL_BASE_URL}/uploads`,
      fields: {
        storage_key: storageKey,
        signature: this.sign(storageKey, expiresAtSeconds),
      },
      storageKey,
      expiresAt: new Date(expiresAtSeconds * MILLISECONDS_PER_SECOND),
      maxBytes: MAX_UPLOAD_BYTES,
    };
  }

  override async upload(input: DirectUploadInput): Promise<StoredAsset> {
    const visibility = visibilityFor(input.purpose);
    const storageKey = this.keyFor(input);

    const asset: StoredAsset = {
      storageKey,
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
      visibility,
      publicUrl: visibility === AssetVisibility.PUBLIC ? `${LOCAL_BASE_URL}/${storageKey}` : null,
      width: null,
      height: null,
      checksum: sha256(input.bytes),
    };

    this.objects.set(storageKey, { asset, bytes: input.bytes });
    return asset;
  }

  override async describe(storageKey: string): Promise<StoredAsset | null> {
    return this.objects.get(storageKey)?.asset ?? null;
  }

  override async readHead(storageKey: string, byteCount: number): Promise<Uint8Array | null> {
    const stored = this.objects.get(storageKey);
    return stored ? stored.bytes.subarray(0, byteCount) : null;
  }

  /**
   * Lands bytes at a key as a browser's direct upload would.
   *
   * The signed-upload handshake sends the file to the provider, not to us, so there is no
   * code path in the API that puts an object at a signed key. This is that path for a
   * test: it is how a suite arranges "the ticket said PDF, the object is an executable"
   * without a provider. The real adapter has no equivalent, and needs none.
   */
  place(input: PlacedObject): StoredAsset {
    const visibility = visibilityFor(input.purpose);
    const asset: StoredAsset = {
      storageKey: input.storageKey,
      contentType: input.contentType ?? OPAQUE_CONTENT_TYPE,
      sizeBytes: input.sizeBytes ?? input.bytes.byteLength,
      visibility,
      publicUrl:
        visibility === AssetVisibility.PUBLIC ? `${LOCAL_BASE_URL}/${input.storageKey}` : null,
      width: null,
      height: null,
      checksum: sha256(input.bytes),
    };

    this.objects.set(input.storageKey, { asset, bytes: input.bytes });
    return asset;
  }

  override async signedUrl(input: SignedUrlInput): Promise<string> {
    // Whole seconds throughout. The URL can only carry a second-resolution expiry, so
    // signing over milliseconds would produce a signature the verifier cannot reproduce.
    const expiresAtSeconds = toSeconds(
      input.issuedAt.getTime() + input.ttlSeconds * MILLISECONDS_PER_SECOND,
    );

    const url = new URL(`${LOCAL_BASE_URL}/${input.storageKey}`);
    url.searchParams.set('expires', String(expiresAtSeconds));
    url.searchParams.set('signature', this.sign(input.storageKey, expiresAtSeconds));

    if (input.transform?.width !== undefined) {
      url.searchParams.set('w', String(input.transform.width));
    }
    if (input.transform?.format !== undefined) {
      url.searchParams.set('f', input.transform.format);
    }

    return url.toString();
  }

  override async remove(storageKey: string): Promise<boolean> {
    return this.objects.delete(storageKey);
  }

  /** Reads bytes back. Test-only affordance; the real provider has no equivalent. */
  read(storageKey: string): Uint8Array | null {
    return this.objects.get(storageKey)?.bytes ?? null;
  }

  /** Checks a URL this twin issued is intact and still inside its window. */
  verifySignedUrl(url: string, now: Date): boolean {
    const parsed = new URL(url);
    const expiresAtSeconds = Number(parsed.searchParams.get('expires'));
    if (!Number.isFinite(expiresAtSeconds)) return false;

    if (expiresAtSeconds * MILLISECONDS_PER_SECOND <= now.getTime()) return false;

    const storageKey = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    return parsed.searchParams.get('signature') === this.sign(storageKey, expiresAtSeconds);
  }

  private keyFor(input: { purpose: SignUploadInput['purpose']; ownerRef: string }): string {
    return `${PURPOSE_FOLDER[input.purpose]}/${input.ownerRef}/${randomBytes(KEY_ENTROPY_BYTES).toString('hex')}`;
  }

  private sign(storageKey: string, expiresAtSeconds: number): string {
    return createHmac('sha256', this.signingKey)
      .update(`${storageKey}:${expiresAtSeconds}`)
      .digest('base64url');
  }
}

function toSeconds(milliseconds: number): number {
  return Math.floor(milliseconds / MILLISECONDS_PER_SECOND);
}
