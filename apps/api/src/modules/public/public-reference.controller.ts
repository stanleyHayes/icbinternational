import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';

import {
  type FxBoard,
  locationSearchQuerySchema,
  routes,
  type BankLocation,
  type LocationSearchQuery,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { LocationService, parsePoint } from '../cms/index.js';

import { PublicCache, PublicCacheInterceptor } from './public-cache.interceptor.js';
import { PublicRateLimitGuard } from './public-rate-limit.guard.js';
import { DIRECTORY_MAX_AGE_SECONDS, RATES_MAX_AGE_SECONDS } from './public.constants.js';
import { RatesService } from './rates.service.js';

/**
 * Reference data: the FX board and the branch directory.
 *
 * Like the content controller, this has no authentication and no dependency capable of
 * reaching customer data. `RatesService` and `LocationService` both read published CMS
 * documents and nothing else.
 *
 * This class used to serve `/public/rates` and `/public/fees` as well, out of the CMS.
 * `ProductsController` binds those same two paths, and Nest resolves a duplicate binding
 * by module registration order — so the products lane answered every request and the
 * handlers here were unreachable. They were also untested, while the products versions
 * are covered by `products-api.integration.test.ts`, which is the better evidence of which
 * lane was meant to own them. Their `@PublicCache` never applied either, which is why the
 * live `/public/rates` carried no `cache-control` header.
 *
 * The CMS rate tables themselves are still read — `RatesService.representativeRate` backs
 * both calculators — they are simply no longer published as their own endpoint.
 */
@Controller()
@UseGuards(PublicRateLimitGuard)
@UseInterceptors(PublicCacheInterceptor)
export class PublicReferenceController {
  constructor(
    private readonly rates: RatesService,
    private readonly locations: LocationService,
  ) {}

  @Get(routes.public.fxBoard)
  @PublicCache({ maxAgeSeconds: RATES_MAX_AGE_SECONDS })
  async fxBoard(): Promise<FxBoard> {
    return this.rates.fxBoard();
  }

  /**
   * The branch and ATM directory.
   *
   * With `near` set, results come back nearest first with a distance on each. Without it,
   * they come back in curated order and `distanceMetres` is null — the contract makes it
   * nullable so a browse does not have to invent a figure.
   */
  @Get(routes.public.locations)
  @PublicCache({ maxAgeSeconds: DIRECTORY_MAX_AGE_SECONDS })
  async locationDirectory(
    @Query(zodBody(locationSearchQuerySchema)) query: LocationSearchQuery,
  ): Promise<BankLocation[]> {
    const near = query.near ? parsePoint(query.near) : null;

    return this.locations.search({
      ...(near ? { near } : {}),
      radiusMetres: query.radiusMetres,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.query ? { query: query.query } : {}),
      limit: query.limit,
    });
  }
}
