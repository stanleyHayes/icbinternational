/**
 * The signed-upload handshake.
 *
 * Two properties are worth proving here, and both are about *not trusting the client*:
 * the object is identified from what storage holds rather than from what the confirm
 * claims, and a key may only be registered by the customer the ticket was issued to.
 */

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import {
  AssetPurpose,
  AssetVisibility,
  MAX_UPLOAD_BYTES,
  UPLOAD_TICKET_TTL_SECONDS,
} from '../files.constants.js';
import { confirmUploadRequestSchema } from '../files.dto.js';
import { InMemoryFileAssetStore } from '../in-memory-file-asset.store.js';
import { InMemoryUploadTicketStore } from '../in-memory-upload-ticket.store.js';
import { InMemoryMediaStorage } from '../ports/in-memory-media-storage.js';
import { UploadHandshakeService } from '../upload-handshake.service.js';

const OWNER = 'usr_01HTEST';
const INTRUDER = 'usr_01HSOMEONEELSE';
const MILLISECONDS_PER_SECOND = 1000;
const UPLOAD_TICKET_LIFETIME_MS = UPLOAD_TICKET_TTL_SECONDS * MILLISECONDS_PER_SECOND;

const PDF = Buffer.concat([Buffer.from('255044462d312e37', 'hex'), Buffer.alloc(256, 0x20)]);
const EXE = Buffer.concat([Buffer.from('4d5a90000300', 'hex'), Buffer.alloc(256, 0x20)]);
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(256, 0x20)]);

function build() {
  const clock = new ClockService();
  const storage = new InMemoryMediaStorage(clock);
  const assets = new InMemoryFileAssetStore(new IdGenerator(), clock);
  const tickets = new InMemoryUploadTicketStore();

  return {
    clock,
    storage,
    assets,
    tickets,
    handshake: new UploadHandshakeService(assets, tickets, storage, clock),
  };
}

/** Signs for an upload and lands `bytes` at the signed key, as the browser would. */
async function upload(
  rig: ReturnType<typeof build>,
  options: {
    ownerId?: string;
    purpose?: AssetPurpose;
    bytes: Uint8Array;
    sizeBytes?: number;
  },
): Promise<string> {
  const purpose = options.purpose ?? AssetPurpose.PROOF_OF_ADDRESS;
  const ticket = await rig.handshake.signUpload({
    ownerId: options.ownerId ?? OWNER,
    purpose,
    fileName: 'statement.pdf',
  });

  rig.storage.place({
    storageKey: ticket.storageKey,
    bytes: options.bytes,
    purpose,
    ...(options.sizeBytes === undefined ? {} : { sizeBytes: options.sizeBytes }),
  });

  return ticket.storageKey;
}

async function codeOf(action: Promise<unknown>): Promise<ErrorCode | undefined> {
  try {
    await action;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.code : undefined;
  }
}

describe('identifying what was actually stored', () => {
  it('registers an upload once the object in storage checks out', async () => {
    const rig = build();
    const storageKey = await upload(rig, { bytes: PDF });

    const asset = await rig.handshake.confirmUpload({
      ownerId: OWNER,
      storageKey,
      fileName: 'statement.pdf',
    });

    expect(asset.verified).toBe(true);
    expect(asset.contentType).toBe('application/pdf');
    expect(asset.sizeBytes).toBe(PDF.byteLength);
    expect(asset.checksum).not.toBe('');
  });

  it('refuses an upload whose stored object is an executable', async () => {
    const rig = build();
    const storageKey = await upload(rig, { bytes: EXE });

    await expect(
      rig.handshake.confirmUpload({ ownerId: OWNER, storageKey, fileName: 'statement.pdf' }),
    ).rejects.toThrow(/Windows program/);

    await expect(rig.assets.findByStorageKey(storageKey)).resolves.toBeNull();
    await expect(rig.storage.describe(storageKey)).resolves.toBeNull();
  });

  /**
   * The regression this whole lane exists for.
   *
   * The confirm body used to carry `headBytes` and `sizeBytes`, so the magic-byte check ran
   * against a string the uploader chose: send a PDF's signature, store an executable, and
   * the check passes on evidence the attacker wrote. The body must not be able to carry
   * either field, and the verdict must come from the object.
   */
  it('ignores content the request tries to declare about the object', async () => {
    const rig = build();
    const storageKey = await upload(rig, { bytes: EXE });

    const parsed = confirmUploadRequestSchema.parse({
      storageKey,
      fileName: 'statement.pdf',
      // What an attacker would send: a PDF's magic bytes over an executable body.
      headBytes: Buffer.from(PDF.subarray(0, 8)).toString('base64'),
      sizeBytes: 1024,
    });

    expect(parsed).toEqual({ storageKey, fileName: 'statement.pdf' });

    await expect(rig.handshake.confirmUpload({ ownerId: OWNER, ...parsed })).rejects.toThrow(
      /Windows program/,
    );
  });

  it('measures the size from storage, not from anything the client says', async () => {
    const rig = build();
    const storageKey = await upload(rig, { bytes: PDF, sizeBytes: MAX_UPLOAD_BYTES + 1 });

    await expect(
      rig.handshake.confirmUpload({ ownerId: OWNER, storageKey, fileName: 'statement.pdf' }),
    ).rejects.toThrow(/larger than 15MB/);
  });

  it('refuses a key storage holds nothing at', async () => {
    const rig = build();
    const ticket = await rig.handshake.signUpload({
      ownerId: OWNER,
      purpose: AssetPurpose.PROOF_OF_ADDRESS,
      fileName: 'statement.pdf',
    });

    await expect(
      codeOf(
        rig.handshake.confirmUpload({
          ownerId: OWNER,
          storageKey: ticket.storageKey,
          fileName: 'statement.pdf',
        }),
      ),
    ).resolves.toBe(ErrorCode.NOT_FOUND);
  });

  it('takes the purpose from the ticket, so visibility cannot be talked up', async () => {
    const rig = build();
    const storageKey = await upload(rig, {
      purpose: AssetPurpose.IDENTITY_DOCUMENT,
      bytes: PNG,
    });

    const asset = await rig.handshake.confirmUpload({
      ownerId: OWNER,
      storageKey,
      fileName: 'passport.png',
    });

    expect(asset.purpose).toBe(AssetPurpose.IDENTITY_DOCUMENT);
    expect(asset.visibility).toBe(AssetVisibility.RESTRICTED);
    expect(asset.publicUrl).toBeNull();
  });
});

describe('who is entitled to claim an upload', () => {
  it('refuses a customer confirming a key issued to someone else', async () => {
    const rig = build();
    const storageKey = await upload(rig, { bytes: PDF });

    await expect(
      codeOf(
        rig.handshake.confirmUpload({
          ownerId: INTRUDER,
          storageKey,
          fileName: 'statement.pdf',
        }),
      ),
    ).resolves.toBe(ErrorCode.FORBIDDEN);

    await expect(rig.assets.findByStorageKey(storageKey)).resolves.toBeNull();

    // The refusal must not have cost the customer their own upload.
    const asset = await rig.handshake.confirmUpload({
      ownerId: OWNER,
      storageKey,
      fileName: 'statement.pdf',
    });
    expect(asset.ownerId).toBe(OWNER);
  });

  it('refuses a key that has already been registered', async () => {
    const rig = build();
    const storageKey = await upload(rig, { bytes: PDF });
    const confirm = () =>
      rig.handshake.confirmUpload({ ownerId: OWNER, storageKey, fileName: 'statement.pdf' });

    await confirm();

    await expect(codeOf(confirm())).resolves.toBe(ErrorCode.CONFLICT);
  });

  it('refuses a ticket that has expired', async () => {
    const rig = build();
    const storageKey = await upload(rig, { bytes: PDF });

    rig.clock.advance(UPLOAD_TICKET_LIFETIME_MS + 1);

    await expect(
      codeOf(
        rig.handshake.confirmUpload({ ownerId: OWNER, storageKey, fileName: 'statement.pdf' }),
      ),
    ).resolves.toBe(ErrorCode.FORBIDDEN);
  });

  it('registers one asset when two confirms race for the same key', async () => {
    const rig = build();
    const storageKey = await upload(rig, { bytes: PDF });
    const confirm = () =>
      rig.handshake.confirmUpload({ ownerId: OWNER, storageKey, fileName: 'statement.pdf' });

    const outcomes = await Promise.allSettled([confirm(), confirm()]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    await expect(rig.assets.list({ ownerId: OWNER, limit: 10 })).resolves.toHaveLength(1);
  });
});
