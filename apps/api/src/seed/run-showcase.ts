import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { ShowcaseModule } from './personas/showcase.module.js';
import { formatShowcaseSummary, ShowcaseService } from './personas/showcase.service.js';

/**
 * `pnpm demo:reset` — rebuild the bank from empty and print how to sign in.
 *
 * Exits non-zero when the ledger does not verify. A dataset whose book fails to reconcile
 * is worse than no dataset: every screen still renders, so the fault is invisible until
 * someone asks a question the numbers cannot answer.
 */
async function main(): Promise<void> {
  const logger = new Logger('Showcase');
  const context = await NestFactory.createApplicationContext(ShowcaseModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const report = await context.get(ShowcaseService).run();
    process.stdout.write(formatShowcaseSummary(report));

    if (!report.ledgerVerified) {
      logger.error('Ledger verification failed — see the findings above.');
      process.exitCode = 1;
    }

    // A verified ledger with no projected rows is a bank whose books are perfect and whose
    // customers see nothing. It has happened; it fails the run now.
    if (report.projectedTransactions === 0) {
      logger.error(
        'The ledger has entries but the transactions projection is empty — no customer would see any activity.',
      );
      process.exitCode = 1;
    }
  } catch (error) {
    logger.error(
      'Showcase generation failed',
      error instanceof Error ? error.stack : String(error),
    );
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

void main();
