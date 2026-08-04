/**
 * What the application is allowed to know about object storage.
 *
 * An abstract class rather than an interface so Nest resolves it as both a type and an
 * injection token. Three implementations sit behind it: Cloudinary, an in-memory twin for
 * tests, and — when Cloudinary is not configured — the same in-memory twin, because the
 * API booting and working without a media provider is a requirement, not a fallback.
 *
 * The one rule this boundary exists to protect: a restricted asset never has a URL that
 * outlives its signature. `publicUrl` is `null` for such assets by construction, so a
 * caller cannot get one by asking politely.
 */

import { type AssetPurpose, type AssetVisibility } from '../files.constants.js';

/** A stored object as the application sees it. */
export interface StoredAsset {
  /** Provider-side identifier, e.g. a Cloudinary `public_id`. */
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly visibility: AssetVisibility;
  /** Only ever populated for `PUBLIC` assets. */
  readonly publicUrl: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly checksum: string;
}

/** Everything the provider needs to accept a browser-side upload. */
export interface SignedUploadTicket {
  /** Endpoint the browser posts the file to. */
  readonly uploadUrl: string;
  /** Fields that must accompany the upload, signature included. */
  readonly fields: Readonly<Record<string, string>>;
  readonly storageKey: string;
  readonly expiresAt: Date;
  readonly maxBytes: number;
}

export interface SignUploadInput {
  readonly purpose: AssetPurpose;
  /** Opaque owner reference, used only to build a stable folder path. */
  readonly ownerRef: string;
  readonly fileName: string;
}

export interface DirectUploadInput {
  readonly purpose: AssetPurpose;
  readonly ownerRef: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

/** On-the-fly delivery transform. Ignored by providers that cannot do it. */
export interface MediaTransform {
  readonly width?: number;
  readonly height?: number;
  readonly crop?: 'fill' | 'fit' | 'thumb';
  readonly format?: 'auto' | 'webp' | 'jpg' | 'png';
  readonly quality?: 'auto' | number;
}

export interface SignedUrlInput {
  readonly storageKey: string;
  readonly ttlSeconds: number;
  readonly transform?: MediaTransform;
  /** Instant the signature is measured from. Always the bank's clock, never the host's. */
  readonly issuedAt: Date;
}

export abstract class MediaStoragePort {
  /** True when a real provider is behind this port. */
  abstract readonly configured: boolean;

  /**
   * Issues a ticket the browser uses to upload directly, so file bytes never transit the
   * API. The signature binds the folder, the purpose and an expiry.
   */
  abstract signUpload(input: SignUploadInput): Promise<SignedUploadTicket>;

  /** Uploads bytes the API already holds — a generated statement PDF, say. */
  abstract upload(input: DirectUploadInput): Promise<StoredAsset>;

  /** Confirms an asset the browser uploaded exists, and reads back its true metadata. */
  abstract describe(storageKey: string): Promise<StoredAsset | null>;

  /**
   * Reads the first `byteCount` bytes of a stored object back out of storage.
   *
   * This exists so that content identification has something trustworthy to identify. The
   * bytes went to the provider without passing through the API, so the only honest source
   * for "what is actually stored at this key" is the provider — never the request that
   * claims the upload finished. Returns `null` when nothing lives at the key.
   */
  abstract readHead(storageKey: string, byteCount: number): Promise<Uint8Array | null>;

  /**
   * A URL that stops working. For restricted material this is the *only* way to read it.
   */
  abstract signedUrl(input: SignedUrlInput): Promise<string>;

  abstract remove(storageKey: string): Promise<boolean>;
}
