/**
 * Know-Your-Customer onboarding.
 *
 * Every step returns the whole `KycCase`, not just the field that changed. The case
 * carries `completedSteps` and `nextStep`, so a wizard can be driven entirely from the
 * server's answer instead of the client keeping its own idea of where the user is —
 * which is how a resumed onboarding ends up on the wrong screen.
 */

import type { z } from 'zod';

import {
  acknowledgedSchema,
  documentSchema,
  kycCaseSchema,
  paginated,
  resource,
  routes,
  type startKycRequestSchema,
  type Acknowledged,
  type CursorQuery,
  type CustomerDocument,
  type KycCase,
  type KycStep,
  type Paginated,
  type Resource,
  type SubmitKycStepRequest,
  type UploadDocumentRequest,
} from '@reliance/contracts';

import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';
import { uploadSignatureSchema, type UploadSignature } from '../provisional/documents.js';

const caseResource = resource(kycCaseSchema);
const documentResource = resource(documentSchema);
const documentList = paginated(documentSchema);
const signatureResource = resource(uploadSignatureSchema);

type StartKycRequest = z.infer<typeof startKycRequestSchema>;

/** Body of the signed-upload handshake. */
export interface UploadSignatureRequest {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

/** Builds the `client.kyc` group. */
export function createKycResource(http: HttpTransport) {
  return {
    /** Opens a KYC case for the requested tier. */
    start: (body: StartKycRequest, options?: MutationOptions): Promise<Resource<KycCase>> =>
      http.post({ ...options, path: routes.kyc.start, body, schema: caseResource }),

    /** The customer's current case, including which step comes next. */
    status: (options?: QueryOptions): Promise<Resource<KycCase>> =>
      http.get({ ...options, path: routes.kyc.status, schema: caseResource }),

    /**
     * Submits one step. `PUT` rather than `POST` because a step is idempotent by
     * identity: submitting `ADDRESS` twice must leave one address, not two.
     */
    submitStep: (
      step: KycStep,
      body: SubmitKycStepRequest,
      options?: MutationOptions,
    ): Promise<Resource<KycCase>> =>
      http.put({ ...options, path: routes.kyc.step(step), body, schema: caseResource }),

    /** Documents attached to the case. */
    listDocuments: (
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<CustomerDocument>> =>
      http.get({ ...options, path: routes.kyc.documents, query, schema: documentList }),

    /** Registers an already-uploaded asset against the case. */
    attachDocument: (
      body: UploadDocumentRequest,
      options?: MutationOptions,
    ): Promise<Resource<CustomerDocument>> =>
      http.post({ ...options, path: routes.kyc.documents, body, schema: documentResource }),

    /** A single document, with a freshly-signed preview URL. */
    getDocument: (id: string, options?: QueryOptions): Promise<Resource<CustomerDocument>> =>
      http.get({ ...options, path: routes.kyc.document(id), schema: documentResource }),

    /** Removes a document from the case. */
    removeDocument: (id: string, options?: MutationOptions): Promise<Acknowledged> =>
      http.delete({ ...options, path: routes.kyc.document(id), schema: acknowledgedSchema }),

    /** Submits the case for review. Refused while a required step is outstanding. */
    submit: (options?: MutationOptions): Promise<Resource<KycCase>> =>
      http.post({ ...options, path: routes.kyc.submit, schema: caseResource }),

    /**
     * Signs a direct-to-storage upload.
     *
     * The bytes never pass through the banking API — the browser posts them straight to
     * the asset host with this signature, and the API only learns the resulting id.
     */
    uploadSignature: (
      body: UploadSignatureRequest,
      options?: MutationOptions,
    ): Promise<Resource<UploadSignature>> =>
      http.post({
        ...options,
        path: routes.kyc.uploadSignature,
        body,
        schema: signatureResource,
      }),
  };
}

/** The `client.kyc` group. */
export type KycResource = ReturnType<typeof createKycResource>;
