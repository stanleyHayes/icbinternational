import { Body, Controller, Get, Param, Patch } from '@nestjs/common';

import {
  ErrorCode,
  Permission,
  featureFlagSchema,
  routes,
  type FeatureFlag,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { AdminEndpoint } from '../rbac/index.js';

import { FeatureFlagStore } from './feature-flag.store.js';

/** Admin console: feature flag management. */
@Controller()
export class AdminFlagsController {
  constructor(
    private readonly flags: FeatureFlagStore,
    private readonly clock: ClockService,
  ) {}

  /** `GET /admin/flags` — all feature flags, alphabetical. */
  @Get(routes.admin.flags)
  @AdminEndpoint(Permission.FLAG_WRITE)
  list(): { data: FeatureFlag[] } {
    return { data: this.flags.list() };
  }

  /** `PATCH /admin/flags/:key` — upsert a flag configuration. */
  @Patch(routes.admin.flag(':key'))
  @AdminEndpoint(Permission.FLAG_WRITE)
  upsert(
    @Param('key') key: string,
    @Body(zodBody(featureFlagSchema)) body: FeatureFlag,
  ): FeatureFlag {
    // Refused rather than reconciled. Either value could be the intended one, and guessing
    // would let a request addressed to one flag quietly rewrite another.
    if (body.key !== key) {
      throw new AppError({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'The flag key in the path and the body must match.',
        details: [{ path: 'key', message: `Path names ${key} but body contains ${body.key}.` }],
      });
    }
    return this.flags.upsert({ ...body, updatedAt: this.clock.now().toISOString() });
  }
}
