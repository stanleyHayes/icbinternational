import type { ClockService } from '../../../common/clock/clock.service.js';
import type { AppConfigService } from '../../../config/config.service.js';
import { AssetPurpose, AssetVisibility } from '../files.constants.js';
import { CloudinaryMediaStorage } from '../ports/cloudinary-media-storage.js';
import type { DirectUploadInput, SignUploadInput, SignedUrlInput } from '../ports/media-storage.port.js';

jest.mock('cloudinary', () => ({
  __esModule: true,
  v2: {
    config: jest.fn(),
    utils: {
      api_sign_request: jest.fn(() => 'signed'),
      private_download_url: jest.fn(() => 'signed-url'),
    },
    uploader: {
      upload: jest.fn(async () => ({ public_id: 'asset', resource_type: 'image', format: 'jpg', bytes: 3, secure_url: 'https://cdn.example/asset.jpg', etag: 'etag', width: 100, height: 200 })),
      destroy: jest.fn(async () => ({ result: 'ok' })),
    },
    api: {
      resource: jest.fn(async () => ({ public_id: 'asset', resource_type: 'image', format: 'jpg', bytes: 3, secure_url: 'https://cdn.example/asset.jpg', etag: 'etag', width: 100, height: 200 })),
    },
    url: jest.fn(() => 'transformed-url'),
  },
}));

describe('CloudinaryMediaStorage', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })) as never;
  });

  function rig() {
    const storage = new CloudinaryMediaStorage(
      { media: { cloudName: 'demo', apiKey: 'api', apiSecret: 'secret', folder: 'bank' } } as unknown as AppConfigService,
      { timestamp: () => 1000, now: () => new Date('2026-03-01T09:00:00.000Z') } as unknown as ClockService,
    );
    return { storage };
  }

  it('signs and uploads assets with the correct visibility and metadata', async () => {
    const { storage } = rig();

    const signed = await storage.signUpload({ purpose: AssetPurpose.IDENTITY_DOCUMENT, ownerRef: 'user', fileName: 'file.png' } as SignUploadInput);
    expect(signed.fields.type).toBe('authenticated');
    expect(signed.storageKey).toContain('identity');

    const uploaded = await storage.upload({
      purpose: AssetPurpose.PROFILE_PHOTO,
      ownerRef: 'user',
      fileName: 'avatar.jpg',
      contentType: 'image/jpeg',
      bytes: new Uint8Array([1, 2, 3]),
    } as DirectUploadInput);

    expect(uploaded.visibility).toBe(AssetVisibility.PUBLIC);
    expect(uploaded.publicUrl).toContain('cdn.example');
  });

  it('describes and removes assets and handles signed URLs', async () => {
    const { storage } = rig();

    const described = await storage.describe('asset');
    expect(described?.visibility).toBe(AssetVisibility.RESTRICTED);

    const signed = await storage.signedUrl({ storageKey: 'asset', ttlSeconds: 60, issuedAt: new Date('2026-03-01T09:00:00.000Z') } as SignedUrlInput);
    expect(signed).toBe('signed-url');

    const removed = await storage.remove('asset');
    expect(removed).toBe(true);
  });

  it('supports transformed urls and returns null when reads fail', async () => {
    const { storage } = rig();

    const transformed = await storage.signedUrl({
      storageKey: 'asset',
      ttlSeconds: 60,
      issuedAt: new Date('2026-03-01T09:00:00.000Z'),
      transform: { width: 200, height: 100 },
    } as SignedUrlInput);
    expect(transformed).toBe('transformed-url');

    const response = await storage.readHead('asset', 4);
    expect(response).toEqual(new Uint8Array([1, 2, 3]));
  });
});
