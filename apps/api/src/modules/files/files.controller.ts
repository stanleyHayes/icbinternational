import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { routes } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { type FileAssetRecord } from './file-asset.store.js';
import {
  confirmUploadRequestSchema,
  listFilesQuerySchema,
  signUploadRequestSchema,
  type ConfirmUploadRequest,
  type FileAssetResponse,
  type ListFilesQuery,
  type SignedUploadTicketResponse,
  type SignUploadRequest,
} from './files.dto.js';
import { FilesService } from './files.service.js';
import { UploadHandshakeService } from './upload-handshake.service.js';

const ID_PARAM = 'id';
const AUDIT_ENTITY = 'document';

/**
 * Uploading to, and reading from, the file register.
 *
 * Every handler scopes by the caller's id taken from the verified token, so there is no
 * route here that can address another customer's documents. Deletion is audited: a
 * document disappearing shortly before a review is exactly the sequence an investigator
 * needs to be able to reconstruct.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly handshake: UploadHandshakeService,
  ) {}

  @Post(routes.files.uploadSignature)
  @HttpCode(HttpStatus.OK)
  async signUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(signUploadRequestSchema)) request: SignUploadRequest,
  ): Promise<SignedUploadTicketResponse> {
    const ticket = await this.handshake.signUpload({
      ownerId: user.userId,
      purpose: request.purpose,
      fileName: request.fileName,
    });

    return {
      uploadUrl: ticket.uploadUrl,
      fields: ticket.fields,
      storageKey: ticket.storageKey,
      expiresAt: ticket.expiresAt.toISOString(),
      maxBytes: ticket.maxBytes,
      acceptedFormats: this.files.describeAccepted(request.purpose).formats,
    };
  }

  /**
   * Registers an upload the browser has completed.
   *
   * Declared before `byId` deliberately: Nest matches in declaration order, and
   * `/files/confirm` registered after `/files/:id` would be answered with "no such
   * document".
   */
  @Post(`${routes.files.byId('confirm')}`)
  @HttpCode(HttpStatus.CREATED)
  @Audited({ action: 'document.upload', entity: AUDIT_ENTITY })
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(confirmUploadRequestSchema)) request: ConfirmUploadRequest,
  ): Promise<FileAssetResponse> {
    const asset = await this.handshake.confirmUpload({
      ownerId: user.userId,
      storageKey: request.storageKey,
      fileName: request.fileName,
    });

    return this.present(asset);
  }

  @Get(routes.files.uploadSignature)
  async listAccepted(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(listFilesQuerySchema)) query: ListFilesQuery,
  ): Promise<FileAssetResponse[]> {
    const assets = await this.files.list(user.userId, query.purpose);
    return Promise.all(assets.map((asset) => this.present(asset)));
  }

  @Get(routes.files.byId(`:${ID_PARAM}`))
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) fileId: string,
  ): Promise<FileAssetResponse> {
    return this.present(await this.files.get(fileId, user.userId));
  }

  @Delete(routes.files.byId(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({ action: 'document.remove', entity: AUDIT_ENTITY })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param(ID_PARAM) fileId: string,
  ): Promise<void> {
    await this.files.remove(fileId, user.userId);
  }

  private async present(asset: FileAssetRecord): Promise<FileAssetResponse> {
    return {
      id: asset.id,
      fileName: asset.fileName,
      purpose: asset.purpose,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      url: await this.files.linkFor(asset),
      uploadedAt: asset.createdAt.toISOString(),
    };
  }
}
