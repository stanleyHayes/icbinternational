import 'reflect-metadata';

import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { GlSeederService, type SeedChartResult } from '../gl-seeder.service.js';
import { GlModule } from '../gl.module.js';

/**
 * Standalone chart-of-accounts seeder: `pnpm --filter @reliance/api gl:seed`.
 *
 * Bootstraps only what seeding needs — config, clock, database and the GL module — not
 * the HTTP surface, then runs the same `GlSeederService` the foundation seed uses. The
 * run is idempotent, so it is safe in every environment, including one that has already
 * been seeded.
 */
@Module({
  imports: [AppConfigModule, ClockModule, DatabaseModule, GlModule],
})
class SeedChartScriptModule {}

async function run(): Promise<void> {
  const logger = new Logger('SeedChart');
  const app = await NestFactory.createApplicationContext(SeedChartScriptModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const result: SeedChartResult = await app.get(GlSeederService).seedChartOfAccounts();
    logger.log(
      `Done — ${result.created} created, ${result.existing} already present, ` +
        `${result.total} rows in the chart`,
    );
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  new Logger('SeedChart').error(error instanceof Error ? error.message : 'Chart seeding failed');
  process.exitCode = 1;
});
