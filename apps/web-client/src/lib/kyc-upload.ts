'use client';

/**
 * Getting an identity document to the bank.
 *
 * Three steps, in this order and no other: the API signs an upload, the bytes go straight to the
 * asset host, and only then is the resulting id registered against the KYC case. Registering first
 * would put a document on the case that nobody can open; sending the bytes through the banking API
 * would put a passport scan in the same request pipeline as a payment.
 *
 * The file is checked against the signature's own limits *before* anything is transferred, so a
 * customer on a train does not upload eight megabytes to be told the ceiling is five.
 */

import type { UploadSignature } from '@reliance/api-client';
import type { CustomerDocument, DocumentKind } from '@reliance/contracts';

import { browserApi } from './api';
import { HANDLERS_IN_BROWSER } from './env';

/** A file the bank will not accept, with the reason already phrased for the customer. */
export class UnacceptableFile extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnacceptableFile';
  }
}

const BYTES_PER_MB = 1_048_576;

function describeLimit(maxBytes: number): string {
  return `${Math.floor(maxBytes / BYTES_PER_MB)} MB`;
}

function assertAcceptable(file: File, signature: UploadSignature): void {
  if (file.size > signature.maxBytes) {
    throw new UnacceptableFile(
      `That file is ${describeLimit(file.size)}, and we can take up to ${describeLimit(signature.maxBytes)}. Try a photo taken at a lower resolution.`,
    );
  }
  if (!signature.allowedMimeTypes.includes(file.type)) {
    throw new UnacceptableFile('We accept JPEG and PNG photos, and PDF documents.');
  }
}

async function transferBytes(file: File, signature: UploadSignature): Promise<void> {
  // With the app answering its own API calls there is no asset host to answer either: the whole
  // service boundary is local, and the signature points at a host that does not exist. The bytes
  // stay in the browser, which is where the preview reads them from anyway.
  if (HANDLERS_IN_BROWSER) return;

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  form.append('public_id', signature.publicId);

  const response = await fetch(signature.uploadUrl, { method: 'POST', body: form });
  if (!response.ok) {
    throw new UnacceptableFile(
      'We could not upload that file. Check your connection and try again — nothing has been sent.',
    );
  }
}

/**
 * Uploads a document and attaches it to the customer's KYC case.
 *
 * @throws {UnacceptableFile} when the file is refused before or during transfer.
 */
export async function uploadKycDocument(file: File, kind: DocumentKind): Promise<CustomerDocument> {
  const api = browserApi();

  const { data: signature } = await api.kyc.uploadSignature({
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  assertAcceptable(file, signature);
  await transferBytes(file, signature);

  const { data } = await api.kyc.attachDocument({
    kind,
    assetId: signature.publicId,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  return data;
}
