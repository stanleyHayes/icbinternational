import { Controller, Get, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common';

import { routes, type Article, type CmsPage, type Faq } from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { ContentKind, ContentService, toArticle, toCmsPage, toFaq } from '../cms/index.js';

import { PublicCache, PublicCacheInterceptor } from './public-cache.interceptor.js';
import { listPostsQuerySchema, type ListPostsQuery } from './public-content.dto.js';
import { PublicRateLimitGuard } from './public-rate-limit.guard.js';
import { CONTENT_MAX_AGE_SECONDS, FAQ_LIMIT, POST_PAGE_SIZE } from './public.constants.js';

const SLUG_PARAM = 'slug';

/**
 * Pages, blog posts and FAQs, served to anyone.
 *
 * **No guard here authenticates anybody, and that is the design.** There is no
 * `JwtAuthGuard`, no `CurrentUser`, and no service injected that can reach a customer
 * record — `ContentService` is the only dependency, and it has no method that returns one.
 * The boundary is structural rather than a check somebody has to remember.
 *
 * Every read goes through `findPublished`, so a draft or a scheduled document is
 * unreachable from here even by guessing its slug.
 */
@Controller()
@UseGuards(PublicRateLimitGuard)
@UseInterceptors(PublicCacheInterceptor)
export class PublicContentController {
  constructor(private readonly content: ContentService) {}

  @Get(routes.public.page(`:${SLUG_PARAM}`))
  @PublicCache({ maxAgeSeconds: CONTENT_MAX_AGE_SECONDS })
  async page(@Param(SLUG_PARAM) slug: string): Promise<CmsPage | null> {
    const record = await this.content.findPublished(ContentKind.PAGE, slug);
    return record ? toCmsPage(record) : null;
  }

  @Get(routes.public.posts)
  @PublicCache({ maxAgeSeconds: CONTENT_MAX_AGE_SECONDS })
  async posts(@Query(zodBody(listPostsQuerySchema)) query: ListPostsQuery): Promise<Article[]> {
    const records = await this.content.listPublished(ContentKind.POST, POST_PAGE_SIZE);

    return records
      .map((record) => toArticle(record))
      .filter((article) => !query.category || article.category === query.category)
      .filter((article) => !query.tag || article.tags.includes(query.tag));
  }

  @Get(routes.public.post(`:${SLUG_PARAM}`))
  @PublicCache({ maxAgeSeconds: CONTENT_MAX_AGE_SECONDS })
  async post(@Param(SLUG_PARAM) slug: string): Promise<Article | null> {
    const record = await this.content.findPublished(ContentKind.POST, slug);
    return record ? toArticle(record) : null;
  }

  @Get(routes.public.faqs)
  @PublicCache({ maxAgeSeconds: CONTENT_MAX_AGE_SECONDS })
  async faqs(@Query(zodBody(listPostsQuerySchema)) query: ListPostsQuery): Promise<Faq[]> {
    const records = await this.content.listPublished(ContentKind.FAQ, FAQ_LIMIT);

    return records
      .map((record) => toFaq(record))
      .filter((faq) => !query.category || faq.category === query.category);
  }
}
