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
  Query,
} from '@nestjs/common';

import { Permission, routes, type Paginated } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { Audited } from '../audit/index.js';
import { AdminEndpoint, CurrentAdmin, type AdminPrincipal } from '../rbac/index.js';

import { toContentDetail, toContentSummary, toRevisionSummary } from './cms-admin.presenter.js';
import { ContentKind, PREVIEW_TOKEN_TTL_SECONDS } from './cms.constants.js';
import {
  contentActionRequestSchema,
  createContentRequestSchema,
  listContentQuerySchema,
  rollbackRequestSchema,
  updateContentRequestSchema,
  type ContentActionRequest,
  type ContentDetail,
  type ContentSummary,
  type CreateContentRequest,
  type ListContentQuery,
  type PreviewLink,
  type RevisionSummary,
  type RollbackRequest,
  type UpdateContentRequest,
} from './cms.dto.js';
import { ContentService } from './content.service.js';
import { PublishingService } from './publishing/publishing.service.js';

const ID_PARAM = 'id';
const AUDIT_ENTITY = 'content';

/** `/admin/cms/pages/:id`, spelled once so the sub-routes below cannot drift from it. */
const DOCUMENT_ROUTE = routes.admin.cmsPage(`:${ID_PARAM}`);

/**
 * The editorial surface.
 *
 * Two permissions, and the split matters: `CONTENT_WRITE` lets someone draft and edit,
 * `CONTENT_PUBLISH` lets them put it in front of customers. An editor who can do both is
 * an editor who can publish an unreviewed rates page, so the guard chain enforces the
 * separation rather than the console hiding a button.
 *
 * Every mutation is audited. A rate table is a regulated statement, and "who changed the
 * savings rate on the public site, and when" has to be answerable.
 */
@Controller()
export class CmsAdminController {
  constructor(
    private readonly content: ContentService,
    private readonly publishing: PublishingService,
  ) {}

  @Get(routes.admin.cmsPages)
  @AdminEndpoint(Permission.CONTENT_WRITE)
  async list(
    @Query(zodBody(listContentQuerySchema)) query: ListContentQuery,
  ): Promise<Paginated<ContentSummary>> {
    const { records, total } = await this.content.list(query);

    return {
      data: records.map((record) => toContentSummary(record)),
      page: {
        cursor: null,
        limit: query.limit,
        hasMore: query.offset + records.length < total,
        total,
      },
    };
  }

  @Post(routes.admin.cmsPages)
  @HttpCode(HttpStatus.CREATED)
  @AdminEndpoint(Permission.CONTENT_WRITE)
  @Audited({ action: 'content.create', entity: AUDIT_ENTITY })
  async create(
    @CurrentAdmin() admin: AdminPrincipal | undefined,
    @Body(zodBody(createContentRequestSchema)) request: CreateContentRequest,
  ): Promise<ContentDetail> {
    const created = await this.content.create({ ...request, by: admin?.id ?? null });
    return toContentDetail(created);
  }

  @Get(routes.admin.cmsPage(`:${ID_PARAM}`))
  @AdminEndpoint(Permission.CONTENT_WRITE)
  async get(@Param(ID_PARAM) id: string): Promise<ContentDetail> {
    return toContentDetail(await this.content.get(id));
  }

  @Patch(routes.admin.cmsPage(`:${ID_PARAM}`))
  @AdminEndpoint(Permission.CONTENT_WRITE)
  @Audited({ action: 'content.update', entity: AUDIT_ENTITY })
  async update(
    @CurrentAdmin() admin: AdminPrincipal | undefined,
    @Param(ID_PARAM) id: string,
    @Body(zodBody(updateContentRequestSchema)) request: UpdateContentRequest,
  ): Promise<ContentDetail> {
    const { note, ...patch } = request;

    const updated = await this.content.update({
      id,
      patch,
      by: admin?.id ?? null,
      ...(note ? { note } : {}),
    });

    return toContentDetail(updated);
  }

  @Delete(routes.admin.cmsPage(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminEndpoint(Permission.CONTENT_WRITE)
  @Audited({ action: 'content.remove', entity: AUDIT_ENTITY })
  async remove(@Param(ID_PARAM) id: string): Promise<void> {
    await this.content.remove(id);
  }

  @Get(`${DOCUMENT_ROUTE}/revisions`)
  @AdminEndpoint(Permission.CONTENT_WRITE)
  async revisions(@Param(ID_PARAM) id: string): Promise<RevisionSummary[]> {
    const history = await this.content.history(id);
    return history.map((revision) => toRevisionSummary(revision));
  }

  @Post(`${DOCUMENT_ROUTE}/rollback`)
  @HttpCode(HttpStatus.OK)
  @AdminEndpoint(Permission.CONTENT_WRITE)
  @Audited({ action: 'content.rollback', entity: AUDIT_ENTITY })
  async rollback(
    @CurrentAdmin() admin: AdminPrincipal | undefined,
    @Param(ID_PARAM) id: string,
    @Body(zodBody(rollbackRequestSchema)) request: RollbackRequest,
  ): Promise<ContentDetail> {
    const restored = await this.content.rollback({
      id,
      revision: request.revision,
      by: admin?.id ?? null,
    });
    return toContentDetail(restored);
  }

  @Get(`${DOCUMENT_ROUTE}/preview`)
  @AdminEndpoint(Permission.CONTENT_WRITE)
  async preview(@Param(ID_PARAM) id: string): Promise<PreviewLink> {
    const minted = await this.publishing.mintPreview(id);
    return { ...minted, expiresInSeconds: PREVIEW_TOKEN_TTL_SECONDS };
  }

  /** Publishing is the privileged step, and carries its own permission. */
  @Post(routes.admin.publish(`:${ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @AdminEndpoint(Permission.CONTENT_PUBLISH)
  @Audited({ action: 'content.transition', entity: AUDIT_ENTITY })
  async transition(
    @CurrentAdmin() admin: AdminPrincipal | undefined,
    @Param(ID_PARAM) id: string,
    @Body(zodBody(contentActionRequestSchema)) request: ContentActionRequest,
  ): Promise<ContentDetail> {
    const updated = await this.publishing.apply({
      id,
      action: request.action,
      by: admin?.id ?? null,
      ...(request.scheduledFor ? { scheduledFor: new Date(request.scheduledFor) } : {}),
    });

    return toContentDetail(updated);
  }

  /**
   * Kind-filtered listing helpers.
   *
   * The generic `/admin/cms/pages` endpoint accepts a `kind` query parameter, but the
   * console's per-kind screens each call a dedicated URL so the path communicates intent
   * and a bookmark goes directly to the right view.
   */
  @Get(routes.admin.cmsPosts)
  @AdminEndpoint(Permission.CONTENT_WRITE)
  async listPosts(
    @Query(zodBody(listContentQuerySchema)) query: ListContentQuery,
  ): Promise<Paginated<ContentSummary>> {
    const { records, total } = await this.content.list({ ...query, kind: ContentKind.POST });
    return {
      data: records.map((record) => toContentSummary(record)),
      page: { cursor: null, limit: query.limit, hasMore: query.offset + records.length < total, total },
    };
  }

  @Get(routes.admin.cmsFaqs)
  @AdminEndpoint(Permission.CONTENT_WRITE)
  async listFaqs(
    @Query(zodBody(listContentQuerySchema)) query: ListContentQuery,
  ): Promise<Paginated<ContentSummary>> {
    const { records, total } = await this.content.list({ ...query, kind: ContentKind.FAQ });
    return {
      data: records.map((record) => toContentSummary(record)),
      page: { cursor: null, limit: query.limit, hasMore: query.offset + records.length < total, total },
    };
  }

  @Get(routes.admin.cmsLocations)
  @AdminEndpoint(Permission.CONTENT_WRITE)
  async listLocations(
    @Query(zodBody(listContentQuerySchema)) query: ListContentQuery,
  ): Promise<Paginated<ContentSummary>> {
    const { records, total } = await this.content.list({ ...query, kind: ContentKind.LOCATION });
    return {
      data: records.map((record) => toContentSummary(record)),
      page: { cursor: null, limit: query.limit, hasMore: query.offset + records.length < total, total },
    };
  }
}
