/**
 * Generic file handling.
 *
 * The bank signs uploads; it does not proxy them. Bytes go browser-to-storage with a
 * signature, and only the resulting id is ever told to the API — which keeps multi-megabyte
 * request bodies off the banking API entirely.
 */

import { resource, routes, type Resource } from '@reliance/contracts';

import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';
import {
  fileReferenceSchema,
  uploadSignatureSchema,
  type FileReference,
  type UploadSignature,
} from '../provisional/documents.js';

const signatureResource = resource(uploadSignatureSchema);
const fileResource = resource(fileReferenceSchema);

/** Body of a signed-upload handshake. */
export interface FileUploadSignatureRequest {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Logical bucket — `kyc`, `dispute-evidence`, `avatar` and so on. */
  readonly purpose: string;
}

/** Builds the `client.files` group. */
export function createFilesResource(http: HttpTransport) {
  return {
    /** Signs a direct-to-storage upload for one file. */
    uploadSignature: (
      body: FileUploadSignatureRequest,
      options?: MutationOptions,
    ): Promise<Resource<UploadSignature>> =>
      http.post({
        ...options,
        path: routes.files.uploadSignature,
        body,
        schema: signatureResource,
      }),

    /** Metadata and a freshly-signed download link for a stored file. */
    get: (id: string, options?: QueryOptions): Promise<Resource<FileReference>> =>
      http.get({ ...options, path: routes.files.byId(id), schema: fileResource }),

    /** Deletes a stored file. Refused while anything still references it. */
    remove: (id: string, options?: MutationOptions): Promise<Resource<FileReference>> =>
      http.delete({ ...options, path: routes.files.byId(id), schema: fileResource }),
  };
}

/** The `client.files` group. */
export type FilesResource = ReturnType<typeof createFilesResource>;
