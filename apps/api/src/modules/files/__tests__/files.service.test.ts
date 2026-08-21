/**
 * The file register.
 *
 * The two properties worth proving: restricted material never gets a permanent URL, and a
 * confirmed upload is identified before it is trusted.
 */

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { AppConfigService } from '../../../config/config.service.js';
import { loadEnvironment } from '../../../config/configuration.js';
import { visibilityFor } from '../asset-visibility.js';
import { AssetPurpose, AssetVisibility } from '../files.constants.js';
import { FilesService } from '../files.service.js';
import { InMemoryFileAssetStore } from '../in-memory-file-asset.store.js';
import { InMemoryMediaStorage } from '../ports/in-memory-media-storage.js';

const OWNER = 'usr_01HTEST';
const PDF = Buffer.concat([Buffer.from('255044462d312e37', 'hex'), Buffer.alloc(256, 0x20)]);
const EXE = Buffer.concat([Buffer.from('4d5a90000300', 'hex'), Buffer.alloc(256, 0x20)]);
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(256, 0x20)]);

/**
 * A config built from a minimal environment.
 *
 * Media is left unconfigured on purpose: the API is required to work without Cloudinary,
 * and this suite is where that requirement is actually exercised.
 */
function buildConfig(): AppConfigService {
  const environment = loadEnvironment({
    MONGODB_URI: 'mongodb://localhost:27017/reliancebank?replicaSet=rs0',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    CSRF_SECRET: 'c'.repeat(32),
    ENCRYPTION_KEY: 'd'.repeat(48),
    NODE_ENV: 'test',
  });

  return new AppConfigService(environment);
}

function build() {
  const clock = new ClockService();
  const storage = new InMemoryMediaStorage(clock);
  const assets = new InMemoryFileAssetStore(new IdGenerator(), clock);
  return { clock, storage, assets, files: new FilesService(assets, storage, clock, buildConfig()) };
}

describe('the visibility rule', () => {
  it('makes identity material restricted and content media public', () => {
    expect(visibilityFor(AssetPurpose.IDENTITY_DOCUMENT)).toBe(AssetVisibility.RESTRICTED);
    expect(visibilityFor(AssetPurpose.PROOF_OF_ADDRESS)).toBe(AssetVisibility.RESTRICTED);
    expect(visibilityFor(AssetPurpose.DISPUTE_EVIDENCE)).toBe(AssetVisibility.RESTRICTED);
    expect(visibilityFor(AssetPurpose.CONTENT_MEDIA)).toBe(AssetVisibility.PUBLIC);
  });
});

describe('storing bytes the API already holds', () => {
  it('gives a KYC document no public URL at all', async () => {
    const { files } = build();

    const asset = await files.storeBytes({
      ownerId: OWNER,
      purpose: AssetPurpose.IDENTITY_DOCUMENT,
      fileName: 'passport.pdf',
      bytes: PDF,
    });

    expect(asset.visibility).toBe(AssetVisibility.RESTRICTED);
    expect(asset.publicUrl).toBeNull();
  });

  it('hands a restricted asset only a signed URL that expires', async () => {
    const { files, storage, clock } = build();

    const asset = await files.storeBytes({
      ownerId: OWNER,
      purpose: AssetPurpose.IDENTITY_DOCUMENT,
      fileName: 'passport.pdf',
      bytes: PDF,
    });

    const url = await files.linkFor(asset);

    expect(storage.verifySignedUrl(url, clock.now())).toBe(true);
    expect(url).toContain('signature=');

    const wellAfterExpiry = new Date(clock.timestamp() + 86_400_000);
    expect(storage.verifySignedUrl(url, wellAfterExpiry)).toBe(false);
  });

  it('gives public content media a permanent address', async () => {
    const { files } = build();

    const asset = await files.storeBytes({
      ownerId: null,
      purpose: AssetPurpose.CONTENT_MEDIA,
      fileName: 'hero.png',
      bytes: PNG,
    });

    expect(asset.visibility).toBe(AssetVisibility.PUBLIC);
    expect(await files.linkFor(asset)).toBe(asset.publicUrl);
  });

  it('refuses an executable however it is named', async () => {
    const { files } = build();

    await expect(
      files.storeBytes({
        ownerId: OWNER,
        purpose: AssetPurpose.IDENTITY_DOCUMENT,
        fileName: 'passport.pdf',
        bytes: EXE,
      }),
    ).rejects.toThrow(/Windows program/);
  });
});

describe('ownership', () => {
  it('does not let one customer read another customer document', async () => {
    const { files } = build();

    const asset = await files.storeBytes({
      ownerId: OWNER,
      purpose: AssetPurpose.IDENTITY_DOCUMENT,
      fileName: 'passport.pdf',
      bytes: PDF,
    });

    await expect(files.get(asset.id, 'usr_01HSOMEONEELSE')).rejects.toThrow(/not found/i);
    await expect(files.get(asset.id, OWNER)).resolves.toMatchObject({ id: asset.id });
  });
});
