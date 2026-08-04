import { Module } from '@nestjs/common';

import { ClockModule } from '../common/clock/clock.module.js';
import { AppConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { GlModule } from '../modules/gl/gl.module.js';
import { ProductsModule } from '../modules/products/products.module.js';

import { AdminRolesSeeder } from './foundation/admin-roles.seed.js';
import { BillersSeeder } from './foundation/billers.seed.js';
import { ChartOfAccountsSeeder } from './foundation/chart-of-accounts.seed.js';
import { CurrenciesSeeder } from './foundation/currencies.seed.js';
import { LocationsSeeder } from './foundation/locations.seed.js';
import { ProductsSeeder } from './foundation/products.seed.js';
import { SeedWriter } from './seed-writer.js';
import { SeedService } from './seed.service.js';
import { SEEDERS, type Seeder } from './seed.types.js';

/**
 * The seed's own application context.
 *
 * Deliberately not part of `AppModule`. A seed imports the database and the modules whose
 * data it writes and nothing else: no HTTP server, no schedulers, no rails. Booting the
 * whole application to insert reference data would start background jobs against a
 * half-populated database, which is exactly the situation the seed exists to prevent.
 */
@Module({
  imports: [AppConfigModule, ClockModule, DatabaseModule, ProductsModule, GlModule],
  providers: [
    SeedWriter,
    ChartOfAccountsSeeder,
    CurrenciesSeeder,
    ProductsSeeder,
    BillersSeeder,
    LocationsSeeder,
    AdminRolesSeeder,
    {
      // Chart of accounts first: it is the only reference data the system cannot post
      // without, and a half-seeded database is better off having it than not.
      // Currencies next: everything priced downstream refers to a currency, and a seed
      // that half-succeeds should at least have written the reference data. Products
      // before billers and locations for the same reason — nothing else depends on those.
      provide: SEEDERS,
      inject: [
        ChartOfAccountsSeeder,
        CurrenciesSeeder,
        ProductsSeeder,
        BillersSeeder,
        LocationsSeeder,
        AdminRolesSeeder,
      ],
      useFactory: (...seeders: Seeder[]): readonly Seeder[] => seeders,
    },
    SeedService,
  ],
  exports: [SeedService],
})
export class SeedModule {}
