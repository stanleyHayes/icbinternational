import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ProductsModule } from '../products/index.js';
import { RbacModule } from '../rbac/index.js';

import { AdminLimitsController } from './admin-limits.controller.js';
import { LimitOverrideRepository } from './limit-override.repository.js';
import { LimitOverrideSchema, LimitOverrideSchemaClass } from './limit-override.schema.js';
import { LimitOverrideService } from './limit-override.service.js';
import { LimitsEngineService } from './limits-engine.service.js';

/**
 * The limits engine: KYC-tier caps and staff overrides on top of the product matrices.
 *
 * Imports `ProductsModule` rather than re-providing its services — the window
 * arithmetic, the counters and the `LIMIT_EXCEEDED` rendering belong to the catalogue
 * that owns the matrices, and two enforcement paths would be two places a limit could
 * disagree with itself. `RbacModule` comes along because the admin controller's guard
 * chain is instantiated inside this module's injector: the guards and their token
 * service must be resolvable here, not just somewhere in the application.
 *
 * Exports the engine for the money-moving lanes (transfers, cards, bill pay) and the
 * override service for the admin console; the repository stays internal.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LimitOverrideSchemaClass.name, schema: LimitOverrideSchema },
    ]),
    ProductsModule,
    RbacModule,
  ],
  controllers: [AdminLimitsController],
  providers: [LimitOverrideRepository, LimitOverrideService, LimitsEngineService],
  exports: [LimitsEngineService, LimitOverrideService],
})
export class LimitsModule {}
