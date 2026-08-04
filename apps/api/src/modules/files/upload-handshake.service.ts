/**
 * The signed-upload handshake: issuing a ticket, and confirming what came back.
 *
 * The bytes go straight from the browser to the storage provider, so at the moment the
 * client says "done" nobody here has seen what was stored. Two things follow from that,
 * and this service exists to enforce both.
 *
 * The object is identified from *storage*. `confirm` reads the head of the object back
 * through {@link MediaStoragePort} and takes the size from the provider's own metadata.
 * Nothing about the content is taken from the request: a magic-byte check performed on
 * bytes the uploader supplied checks nothing at all, since an executable posted with a
 * PDF's first four bytes would sail through it.
 *
 * The confirm is attributed. A signed key is not a secret worth relying on — it appears in
 * URLs, logs and browser history — so the key alone cannot be what entitles a caller to
 * register an asset. The ticket issued at signing time binds the key to one customer, and
 * confirming spends it exactly once.
 */

import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

import { visibilityFor } from './asset-visibility.js';
import { FileAssetStore, type FileAssetRecord } from './file-asset.store.js';
import {
  AssetVisibility,
  MAX_UPLOAD_BYTES,
  SNIFF_WINDOW_BYTES,
  type AssetPurpose,
} from './files.constants.js';
import { discardQuietly } from './media-cleanup.js';
import {
  MediaStoragePort,
  type SignedUploadTicket,
  type StoredAsset,
} from './ports/media-storage.port.js';
import { assessUpload } from './upload-policy.js';
import { UploadTicketStore, type UploadTicketRecord } from './upload-ticket.store.js';

/** Stands in for a head we could not read. Never identifiable, so never accepted. */
const NO_HEAD = new Uint8Array(0);

export interface SignUploadCommand {
  readonly ownerId: string;
  readonly purpose: AssetPurpose;
  readonly fileName: string;
}

/**
 * A claim that an upload finished.
 *
 * Deliberately nothing here describes the content. The purpose comes from the ticket, the
 * size and the bytes come from storage, and `fileName` is a label the customer sees rather
 * than anything the bank decides on.
 */
export interface ConfirmUploadCommand {
  readonly ownerId: string;
  readonly storageKey: string;
  readonly fileName: string;
}

@Injectable()
export class UploadHandshakeService {
  private readonly logger = new Logger(UploadHandshakeService.name);

  constructor(
    private readonly assets: FileAssetStore,
    private readonly tickets: UploadTicketStore,
    private readonly storage: MediaStoragePort,
    private readonly clock: ClockService,
  ) {}

  /**
   * Issues the browser a ticket to upload directly to the provider, and records it.
   *
   * The record is what makes the eventual confirm attributable to this customer.
   */
  async signUpload(command: SignUploadCommand): Promise<SignedUploadTicket> {
    const ticket = await this.storage.signUpload({
      purpose: command.purpose,
      ownerRef: command.ownerId,
      fileName: command.fileName,
    });

    await this.tickets.issue({
      storageKey: ticket.storageKey,
      ownerId: command.ownerId,
      purpose: command.purpose,
      issuedAt: this.clock.now(),
      expiresAt: ticket.expiresAt,
    });

    return ticket;
  }

  /**
   * Registers an upload, after identifying the object storage actually holds.
   *
   * @throws {AppError} `CONFLICT` when the key is already in the register.
   * @throws {AppError} `FORBIDDEN` when no live ticket for this caller covers the key.
   * @throws {AppError} `NOT_FOUND` when storage holds nothing at the key.
   * @throws {AppError} `UNSUPPORTED_MEDIA_TYPE` when the stored bytes are not what this
   *   purpose accepts — including when they are an executable wearing a document's name.
   */
  async confirmUpload(command: ConfirmUploadCommand): Promise<FileAssetRecord> {
    const ticket = await this.claimTicket(command);
    const stored = await this.requireStored(command.storageKey);
    const verdict = assessUpload({
      purpose: ticket.purpose,
      bytes: await this.headOf(stored),
      sizeBytes: stored.sizeBytes,
    });

    if (!verdict.accepted) {
      await discardQuietly(this.storage, command.storageKey, this.logger);
      throw new AppError({
        code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        message: verdict.reason,
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        context: { storageKey: command.storageKey, purpose: ticket.purpose },
      });
    }

    const visibility = visibilityFor(ticket.purpose);

    return this.assets.insert({
      ownerId: ticket.ownerId,
      purpose: ticket.purpose,
      visibility,
      storageKey: command.storageKey,
      fileName: command.fileName,
      contentType: verdict.contentType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      publicUrl: visibility === AssetVisibility.PUBLIC ? stored.publicUrl : null,
      verified: true,
    });
  }

  /**
   * Establishes that this caller is entitled to register this key, and spends the right.
   *
   * Before any storage work, so an unauthorised caller learns nothing about whether the
   * key they guessed exists. Spending the ticket even when the bytes go on to be refused
   * is intended: the object is discarded with them, so the key is dead either way and a
   * customer retrying uploads afresh.
   */
  private async claimTicket(command: ConfirmUploadCommand): Promise<UploadTicketRecord> {
    const registered = await this.assets.findByStorageKey(command.storageKey);
    if (registered) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        'That upload has already been registered. Please upload the file again.',
      );
    }

    const ticket = await this.tickets.claim({
      storageKey: command.storageKey,
      ownerId: command.ownerId,
      now: this.clock.now(),
    });

    if (!ticket) {
      throw AppError.forbidden('We have no record of that upload. Please upload the file again.');
    }

    return ticket;
  }

  private async requireStored(storageKey: string): Promise<StoredAsset> {
    const stored = await this.storage.describe(storageKey);
    if (stored) return stored;

    throw new AppError({
      code: ErrorCode.NOT_FOUND,
      message: 'We could not find that upload. Please upload the file again.',
      status: HttpStatus.NOT_FOUND,
      context: { storageKey },
    });
  }

  /**
   * The head of the object, read back from storage.
   *
   * Skipped for an object already too large to accept: the size check refuses it first,
   * and pulling bytes out of a file whose only interesting property is its size would make
   * the identification step the attack rather than the defence.
   */
  private async headOf(stored: StoredAsset): Promise<Uint8Array> {
    if (stored.sizeBytes > MAX_UPLOAD_BYTES) return NO_HEAD;
    return (await this.storage.readHead(stored.storageKey, SNIFF_WINDOW_BYTES)) ?? NO_HEAD;
  }
}
