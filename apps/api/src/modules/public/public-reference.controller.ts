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
import { type FeeSchedule, type RateTable } from './public.dto.js';
import { RatesService } from './rates.service.js';

/**
 * Reference data: what the bank charges, what it pays, and where its branches are.
 *
 * Like the content controller, this has no authentication and no dependency capable of
 * reaching customer data. `RatesService` and `LocationService` both read published CMS
 * documents and nothing else.
 */
@Controller()
@UseGuards(PublicRateLimitGuard)
@UseInterceptors(PublicCacheInterceptor)
export class PublicReferenceController {
  constructor(
    private readonly rates: RatesService,
    private readonly locations: LocationService,
  ) {}

  @Get(routes.public.rates)
  @PublicCache({ maxAgeSeconds: RATES_MAX_AGE_SECONDS })
  async rateTables(): Promise<RateTable[]> {
    return this.rates.tables();
  }

  @Get(routes.public.fees)
  @PublicCache({ maxAgeSeconds: RATES_MAX_AGE_SECONDS })
  async fees(): Promise<FeeSchedule[]> {
    return this.rates.fees();
  }

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
