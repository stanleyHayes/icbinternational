import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { SeedModule } from './seed.module.js';
import { SeedService, type SeedReport } from './seed.service.js';

/** Non-zero so a deployment pipeline halts on a failed seed. */
const FAILURE_EXIT_CODE = 1;

/**
 * `pnpm seed` — populate the foundation data.
 *
 * Safe to run against a populated database and safe to run twice: every seeder writes by
 * natural key and reports what it actually changed. The summary is printed rather than
 * merely logged because the second run's headline — "no changes" — is the thing an
 * operator is checking for.
 *
 * Exits non-zero on failure so a deployment pipeline stops rather than starting an
 * application whose reference data is half-written.
 */
async function runSeed(): Promise<void> {
  const logger = new Logger('Seed');
  const context = await NestFactory.createApplicationContext(SeedModule, { bufferLogs: false });

  try {
    const report = await context.get(SeedService).run();
    logger.log(summarise(report));
  } finally {
    await context.close();
  }
}

function summarise(report: SeedReport): string {
  const headline = report.noOp
    ? 'no changes — the database already matched the seed'
    : `${report.inserted} inserted, ${report.updated} updated`;

  const collections = report.outcomes
    .map((outcome) => `${outcome.collection}=${outcome.inserted}+${outcome.updated}`)
    .join(' ');

  return `Foundation seed complete in ${report.durationMs}ms: ${headline} (${collections}), ${report.unchanged} unchanged`;
}

runSeed().catch((error: unknown) => {
  new Logger('Seed').error('Foundation seed failed', error instanceof Error ? error.stack : error);
  process.exitCode = FAILURE_EXIT_CODE;
});
