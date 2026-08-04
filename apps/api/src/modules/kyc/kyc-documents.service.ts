/**
 * The documents on a KYC case: attachment, reads and removal.
 *
 * The browser uploads bytes straight to storage; attachment is when the bank actually
 * looks. The object is described back from storage, entered into the file register as
 * restricted material, and OCR'd — only after all three does the document exist on the
 * case. The one rule this service exists to enforce: KYC material is never publicly
 * addressable. An artefact storage reports as publicly visible is refused and
 * discarded, and every read is a freshly-signed short-lived URL (see the presenter).
 */

import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import {
  DocumentKind,
  ErrorCode,
  type DocumentKind as DocumentKindType,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { buildPage, decodeCursor, type PageResult } from '../../common/pagination/cursor.js';
import {
  AssetPurpose,
  AssetVisibility,
  FileAssetStore,
  MediaStoragePort,
  type StoredAsset,
} from '../files/index.js';

import { isEditable } from './domain/kyc-steps.js';
import { KycCaseRepository } from './kyc-case.repository.js';
import { type KycAttachedDocument, type KycCaseDocument } from './kyc-case.schema.js';
import { MAX_DOCUMENTS_PER_CASE } from './kyc.constants.js';
import { OcrPort, OcrVerdict } from './ports/kyc-vendor.ports.js';

/** Kinds an OCR pass can read. A selfie is checked by liveness instead; OTHER, by a human. */
const OCR_CHECKED_KINDS: readonly DocumentKindType[] = Object.freeze([
  DocumentKind.PASSPORT,
  DocumentKind.NATIONAL_ID,
  DocumentKind.DRIVING_LICENCE,
  DocumentKind.PROOF_OF_ADDRESS,
  DocumentKind.PAYSLIP,
  DocumentKind.BANK_STATEMENT,
  DocumentKind.BUSINESS_REGISTRATION,
]);

/** What the client declares when attaching an uploaded artefact. */
export interface AttachDocumentCommand {
  readonly userId: string;
  readonly kind: DocumentKindType;
  readonly assetId: string;
  readonly fileName: string;
}

@Injectable()
export class KycDocumentsService {
  private readonly logger = new Logger(KycDocumentsService.name);

  constructor(
    private readonly cases: KycCaseRepository,
    private readonly storage: MediaStoragePort,
    private readonly assets: FileAssetStore,
    private readonly ocr: OcrPort,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  /**
   * Registers an uploaded artefact against the case and runs the OCR pass.
   *
   * @throws {AppError} `KYC_DOCUMENT_INVALID` when storage cannot describe the artefact,
   *   or when it is publicly addressable (in which case it is also discarded).
   * @returns the attached document envelope.
   */
  async attach(command: AttachDocumentCommand): Promise<KycAttachedDocument> {
    const kycCase = await this.requireEditableCase(command.userId);
    assertRoomFor(kycCase, command.assetId);

    const stored = await this.storage.describe(command.assetId);
    if (!stored) {
      throw documentInvalid('We could not find that upload. Please try uploading it again.');
    }
    if (stored.visibility === AssetVisibility.PUBLIC) {
      await this.discard(command.assetId);
      throw documentInvalid('That upload could not be accepted. Please upload it again.');
    }

    const assetId = await this.registerAsset(command, stored);
    const document = await this.buildDocument(command, stored, assetId);

    const updated = await this.cases.patch(kycCase.id, { $push: { documents: document } });
    if (!updated) throw AppError.notFound('KYC case', kycCase.id);
    return document;
  }

  /** One attached document, or `NOT_FOUND`. Ownership is scoped through the case. */
  async getDocument(userId: string, documentId: string): Promise<KycAttachedDocument> {
    const kycCase = await this.requireCase(userId);
    const document = kycCase.documents.find((doc) => doc.id === documentId);
    if (!document) throw AppError.notFound('Document', documentId);
    return document;
  }

  /**
   * The case's documents, newest first, cursor-paginated.
   *
   * The documents live inside the case document, so the page is sliced in memory — a
   * case carries at most a dozen artefacts, and a sub-pipeline would buy nothing.
   */
  async listDocuments(
    userId: string,
    query: { cursor?: string; limit: number },
  ): Promise<PageResult<KycAttachedDocument>> {
    const kycCase = await this.requireCase(userId);
    const ordered = [...kycCase.documents].sort(
      (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime(),
    );
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const eligible = after
      ? ordered.filter((doc) => {
          const stamp = doc.uploadedAt.toISOString();
          return stamp < after.sortValue || (stamp === after.sortValue && doc.id < after.id);
        })
      : ordered;

    return buildPage({
      records: eligible,
      limit: query.limit,
      toCursor: (doc) => ({ sortValue: doc.uploadedAt.toISOString(), id: doc.id }),
    });
  }

  /**
   * Detaches a document and discards the artefact.
   *
   * Removal is deliberately available only while the case is editable — once a file is
   * part of a submitted application it is evidence, and evidence does not disappear.
   */
  async remove(userId: string, documentId: string): Promise<void> {
    const kycCase = await this.requireEditableCase(userId);
    const document = kycCase.documents.find((doc) => doc.id === documentId);
    if (!document) throw AppError.notFound('Document', documentId);

    await this.cases.patch(kycCase.id, { $pull: { documents: { id: documentId } } });
    await this.assets.remove(document.fileAssetId, userId);
    await this.discard(document.assetId);
  }

  /** The case, or the refusal every document operation shares. */
  private async requireCase(userId: string): Promise<KycCaseDocument> {
    const kycCase = await this.cases.findByUser(userId);
    if (!kycCase) throw AppError.notFound('KYC case');
    return kycCase;
  }

  /** The case, but only while the customer may still change it. */
  private async requireEditableCase(userId: string): Promise<KycCaseDocument> {
    const kycCase = await this.requireCase(userId);
    if (isEditable(kycCase.status)) return kycCase;
    throw AppError.conflict(
      ErrorCode.CONFLICT,
      'This application has already been submitted, so its documents can no longer be changed.',
    );
  }

  /** Enters the artefact into the file register as restricted material. */
  private async registerAsset(
    command: AttachDocumentCommand,
    stored: StoredAsset,
  ): Promise<string> {
    const asset = await this.assets.insert({
      ownerId: command.userId,
      purpose: AssetPurpose.IDENTITY_DOCUMENT,
      visibility: AssetVisibility.RESTRICTED,
      storageKey: command.assetId,
      fileName: command.fileName,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      publicUrl: null,
      verified: true,
    });
    return asset.id;
  }

  /** Builds the embedded document, OCR verdict included where the kind calls for one. */
  private async buildDocument(
    command: AttachDocumentCommand,
    stored: StoredAsset,
    fileAssetId: string,
  ): Promise<KycAttachedDocument> {
    const base: KycAttachedDocument = {
      id: this.ids.generate('document'),
      kind: command.kind,
      assetId: command.assetId,
      fileAssetId,
      fileName: command.fileName,
      mimeType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      uploadedAt: this.clock.now(),
      verified: false,
      ocr: null,
    };
    if (!OCR_CHECKED_KINDS.includes(command.kind)) return base;

    const extraction = await this.ocr.extract({
      documentId: base.id,
      kind: command.kind,
      fileName: command.fileName,
    });
    return {
      ...base,
      verified: extraction.verdict === OcrVerdict.READABLE,
      ocr: { verdict: extraction.verdict, confidenceBps: extraction.confidenceBps },
    };
  }

  /** Best-effort removal of an object we have decided not to keep. */
  private async discard(storageKey: string): Promise<void> {
    try {
      await this.storage.remove(storageKey);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not remove KYC object: ${detail}`);
    }
  }
}

/** Capacity and duplication guards on attachment. */
function assertRoomFor(kycCase: KycCaseDocument, assetId: string): void {
  if (kycCase.documents.length >= MAX_DOCUMENTS_PER_CASE) {
    throw AppError.conflict(
      ErrorCode.CONFLICT,
      'This application already has the maximum number of documents. Remove one before adding another.',
    );
  }
  if (kycCase.documents.some((doc) => doc.assetId === assetId)) {
    throw AppError.conflict(
      ErrorCode.CONFLICT,
      'That file is already attached to this application.',
    );
  }
}

function documentInvalid(message: string): AppError {
  return new AppError({
    code: ErrorCode.KYC_DOCUMENT_INVALID,
    message,
    status: HttpStatus.BAD_REQUEST,
  });
}
