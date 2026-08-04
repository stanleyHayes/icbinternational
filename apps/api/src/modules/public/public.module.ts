import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ClockModule } from '../../common/clock/clock.module.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { CmsModule } from '../cms/index.js';

import { CalculatorService } from './calculators/calculator.service.js';
import { LeadRepository } from './leads/lead.repository.js';
import { LeadSchema } from './leads/lead.schema.js';
import { LeadService } from './leads/lead.service.js';
import { LeadStore } from './leads/lead.store.js';
import { PublicCacheInterceptor } from './public-cache.interceptor.js';
import { PublicContentController } from './public-content.controller.js';
import { PublicRateLimitGuard } from './public-rate-limit.guard.js';
import { PublicReferenceController } from './public-reference.controller.js';
import { PublicToolsController } from './public-tools.controller.js';
import { LEAD_MODEL } from './public.constants.js';
import { RatesService } from './rates.service.js';

/**
 * The unauthenticated surface the marketing site runs on.
 *
 * The module's import list is the boundary. It pulls in `CmsModule` and its own lead
 * collection, and **nothing else** — no `AuthModule`, no `UsersModule`, no accounts,
 * transactions or cards. A route here cannot reach customer data because nothing in this
 * injector graph knows how to.
 *
 * That is a stronger guarantee than a guard, and it is what
 * `__tests__/public-boundary.test.ts` asserts: it walks the controllers' constructor
 * metadata and fails if a forbidden dependency ever appears.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: LEAD_MODEL, schema: LeadSchema }]),
    ClockModule,
    CmsModule,
  ],
  controllers: [PublicContentController, PublicReferenceController, PublicToolsController],
  providers: [
    { provide: LeadStore, useClass: LeadRepository },
    RatesService,
    CalculatorService,
    LeadService,
    PublicCacheInterceptor,
    PublicRateLimitGuard,
    IdGenerator,
  ],
  exports: [RatesService, CalculatorService],
})
export class PublicModule {}
