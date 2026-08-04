/**
 * The customer's KYC endpoints.
 *
 * Every handler scopes by the caller's id from the verified token, so no route here can
 * address another customer's case or documents. Mutations are audited with a field
 * allow-list — the case is the most PII-dense record the bank holds, and the audit
 * trail gets the workflow, never the personal answers.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { type z } from 'zod';

import {
  cursorQuerySchema,
  ErrorCode,
  routes,
  startKycRequestSchema,
  uploadDocumentRequestSchema,
  type CursorQuery,
  type CustomerDocument,
  type KycCase,
  type UploadDocumentRequest,
} from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { type PageResult } from '../../common/pagination/cursor.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { KycCaseService } from './kyc-case.service.js';
import { KycDocumentsService } from './kyc-documents.service.js';
import { KycSubmissionService } from './kyc-submission.service.js';
import {
  KycUploadSignatureService,
  type KycUploadSignature,
} from './kyc-upload-signature.service.js';
import {
  KYC_AUDIT_CAPTURE_FIELDS,
  KYC_AUDIT_ENTITY,
  KYC_DOCUMENT_AUDIT_ENTITY,
} from './kyc.constants.js';
import {
  kycUploadSignatureRequestSchema,
  submitKycStepApiSchema,
  type KycUploadSignatureRequest,
  type SubmitKycStepApi,
} from './kyc.dto.js';
import { KycPresenter } from './kyc.presenter.js';

const STEP_PARAM = 'step';
const DOCUMENT_ID_PARAM = 'id';

/** Body of `POST /kyc/start` after validation. */
type StartKycBody = z.infer<typeof startKycRequestSchema>;

/** The audit options every case-mutating route shares. */
const CASE_AUDIT = {
  entity: KYC_AUDIT_ENTITY,
  captureFields: KYC_AUDIT_CAPTURE_FIELDS,
} as const;

@Controller()
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(
    private readonly cases: KycCaseService,
    private readonly documents: KycDocumentsService,
    private readonly signatures: KycUploadSignatureService,
    private readonly submission: KycSubmissionService,
    private readonly presenter: KycPresenter,
  ) {}

  /** Opens the customer's case, or hands back the one they already have. */
  @Post(routes.kyc.start)
  @HttpCode(HttpStatus.CREATED)
  @Audited({ ...CASE_AUDIT, action: 'kyc.start' })
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(startKycRequestSchema)) request: StartKycBody,
  ): Promise<KycCase> {
    return this.presenter.present(await this.cases.start(user.userId, request.requestedTier));
  }

  /** The case as it stands — including a `NOT_STARTED` shell for a brand-new customer. */
  @Get(routes.kyc.status)
  async status(@CurrentUser() user: AuthenticatedUser): Promise<KycCase> {
    return this.presenter.present(await this.cases.getStatus(user.userId));
  }

  /**
   * Answers one wizard step. Both verbs are accepted: the contract names `PATCH`,
   * the typed client sends `PUT`, and a step is idempotent by identity under either.
   */
  @Put(routes.kyc.step(`:${STEP_PARAM}`))
  @Patch(routes.kyc.step(`:${STEP_PARAM}`))
  @Audited({ ...CASE_AUDIT, action: 'kyc.step.submit' })
  async submitStep(
    @CurrentUser() user: AuthenticatedUser,
    @Param(STEP_PARAM) step: string,
    @Body(zodBody(submitKycStepApiSchema)) request: SubmitKycStepApi,
  ): Promise<KycCase> {
    if (step !== request.step) {
      throw new AppError({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'The step in the path and the step in the body do not match.',
        details: [{ path: 'step', message: `Path says ${step}, body says ${request.step}.` }],
      });
    }
    return this.presenter.present(await this.cases.submitStep(user.userId, request));
  }

  /** Signs a direct-to-storage upload for one KYC artefact. */
  @Post(routes.kyc.uploadSignature)
  @HttpCode(HttpStatus.OK)
  async uploadSignature(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(kycUploadSignatureRequestSchema)) request: KycUploadSignatureRequest,
  ): Promise<KycUploadSignature> {
    return this.signatures.signUpload({ userId: user.userId, ...request });
  }

  /** Registers an uploaded artefact against the case and runs the OCR pass. */
  @Post(routes.kyc.documents)
  @HttpCode(HttpStatus.CREATED)
  @Audited({ action: 'kyc.document.attach', entity: KYC_DOCUMENT_AUDIT_ENTITY })
  async attachDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(uploadDocumentRequestSchema)) request: UploadDocumentRequest,
  ): Promise<CustomerDocument> {
    const document = await this.documents.attach({
      userId: user.userId,
      kind: request.kind,
      assetId: request.assetId,
      fileName: request.fileName,
    });
    return this.presenter.presentDocument(document);
  }

  /** The case's documents, newest first. */
  @Get(routes.kyc.documents)
  async listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(cursorQuerySchema)) query: CursorQuery,
  ): Promise<PageResult<CustomerDocument>> {
    const page = await this.documents.listDocuments(user.userId, query);
    return {
      data: await Promise.all(page.data.map((d) => this.presenter.presentDocument(d))),
      page: page.page,
    };
  }

  /** One document, with a freshly-signed preview URL. */
  @Get(routes.kyc.document(`:${DOCUMENT_ID_PARAM}`))
  async getDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param(DOCUMENT_ID_PARAM) documentId: string,
  ): Promise<CustomerDocument> {
    return this.presenter.presentDocument(
      await this.documents.getDocument(user.userId, documentId),
    );
  }

  /** Detaches a document while the case is still editable. */
  @Delete(routes.kyc.document(`:${DOCUMENT_ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @Audited({
    action: 'kyc.document.remove',
    entity: KYC_DOCUMENT_AUDIT_ENTITY,
    entityIdFrom: `params.${DOCUMENT_ID_PARAM}`,
  })
  async removeDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param(DOCUMENT_ID_PARAM) documentId: string,
  ): Promise<{ acknowledged: true }> {
    await this.documents.remove(user.userId, documentId);
    return { acknowledged: true };
  }

  /** Submits the case for decision. */
  @Post(routes.kyc.submit)
  @HttpCode(HttpStatus.OK)
  @Audited({ ...CASE_AUDIT, action: 'kyc.submit' })
  async submit(@CurrentUser() user: AuthenticatedUser): Promise<KycCase> {
    return this.presenter.present(await this.submission.submit(user.userId));
  }
}
