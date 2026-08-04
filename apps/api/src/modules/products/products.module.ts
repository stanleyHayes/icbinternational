import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { RbacModule } from '../rbac/rbac.module.js';

import { AdminProductsController } from './admin-products.controller.js';
import { FeeService } from './fee.service.js';
import { LimitsService } from './limits.service.js';
import { ProductRepository } from './product.repository.js';
import { ProductSchema, ProductSchemaClass } from './product.schema.js';
import { ProductService } from './product.service.js';
import { ProductsController } from './products.controller.js';
import { UsageCounterRepository } from './usage-counter.repository.js';
import { UsageCounterSchema, UsageCounterSchemaClass } from './usage-counter.schema.js';

/**
 * The product catalogue, its pricing and its limits.
 *
 * Exports the three services rather than the repositories: accounts, transfers and cards
 * all need to price a fee or check a limit, and none of them has any business reading the
 * catalogue's documents directly.
 *
 * `IdGenerator` is provided locally so the module resolves standalone — the seed boots it
 * without `AppModule`, and a feature module that only works inside one particular parent
 * is not a module. A handoff proposes promoting it to a global provider so the whole
 * application shares a single monotonic ULID factory.
 */
@Module({
  imports: [
    RbacModule,
    MongooseModule.forFeature([
      { name: ProductSchemaClass.name, schema: ProductSchema },
      { name: UsageCounterSchemaClass.name, schema: UsageCounterSchema },
    ]),
  ],
  controllers: [ProductsController, AdminProductsController],
  providers: [
    IdGenerator,
    ProductRepository,
    UsageCounterRepository,
    ProductService,
    FeeService,
    LimitsService,
  ],
  exports: [ProductService, FeeService, LimitsService],
})
export class ProductsModule {}
