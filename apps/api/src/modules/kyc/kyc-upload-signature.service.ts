/**
 * The signed-upload handshake for KYC material.
 *
 * The browser uploads bytes straight to object storage against the ticket this service
 * issues — the banking API never proxies a passport scan. Size and type are checked
 * against the files lane's upload policy *before* a signature is spent, so a customer
 * on a slow connection is told upfront rather than after the bytes.
 */

import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error.js';
import { ALLOWED_TYPES, AssetPurpose, MAX_UPLOAD_BYTES, MediaStoragePort } from '../files/index.js';

import { KYC_UPLOAD_FOLDER } from './kyc.constants.js';

/** The handshake answer, in the shape the client's upload helper already speaks. */
export interface KycUploadSignature {
  readonly uploadUrl: string;
  readonly signature: string;
  readonly timestamp: number;
  readonly apiKey: string;
  readonly folder: string;
  /** The artefact's key; the client quotes it back when attaching. */
  readonly publicId: string;
  readonly expiresAt: string;
  readonly maxBytes: number;
  readonly allowedMimeTypes: readonly string[];
}

/** What the client declares about the file it is about to upload. */
export interface SignKycUploadCommand {
  readonly userId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

/** MIME types acceptable for KYC material, from the files lane's upload policy. */
export const KYC_ALLOWED_MIME_TYPES: readonly string[] =
  ALLOWED_TYPES[AssetPurpose.IDENTITY_DOCUMENT];

@Injectable()
export class KycUploadSignatureService {
  constructor(private readonly storage: MediaStoragePort) {}

  /** Issues the browser a ticket to upload one artefact directly to storage. */
  async signUpload(command: SignKycUploadCommand): Promise<KycUploadSignature> {
    assertAcceptable(command.mimeType, command.sizeBytes);

    const ticket = await this.storage.signUpload({
      purpose: AssetPurpose.IDENTITY_DOCUMENT,
      ownerRef: command.userId,
      fileName: command.fileName,
    });

    return {
      uploadUrl: ticket.uploadUrl,
      signature: ticket.fields['signature'] ?? '',
      timestamp: Number(ticket.fields['timestamp'] ?? 0),
      apiKey: ticket.fields['api_key'] ?? '',
      folder: ticket.fields['folder'] ?? KYC_UPLOAD_FOLDER,
      publicId: ticket.storageKey,
      expiresAt: ticket.expiresAt.toISOString(),
      maxBytes: ticket.maxBytes,
      allowedMimeTypes: KYC_ALLOWED_MIME_TYPES,
    };
  }
}

/** Refuses an upload the policy would reject, before a signature is spent on it. */
function assertAcceptable(mimeType: string, sizeBytes: number): void {
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw AppError.validation('That file is too large. Please upload a smaller copy.', [
      { path: 'sizeBytes', message: 'Above the maximum upload size.' },
    ]);
  }
  if (!KYC_ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw AppError.validation('We accept JPEG and PNG photos, and PDF documents.', [
      { path: 'mimeType', message: 'Unsupported file type.' },
    ]);
  }
}
