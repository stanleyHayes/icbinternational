import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { LedgerVerifierService } from '../ledger-verifier.service.js';
import { LedgerModule } from '../ledger.module.js';

import { LedgerRepairService } from './ledger-repair.service.js';
import { type LedgerVerificationReport } from './verification.types.js';

/**
 * The `pnpm ledger:verify` command.
 *
 * Rebuilds every balance from the journal entries and diffs it against the stored
 * projections — GL accounts and customer accounts alike — then checks the trial balance
 * and the `SUM(customer deposits) === GL 2000` identity. With `--repair`, drift is
 * corrected from the postings (the only source of truth) and the book is verified a
 * second time before the verdict is given.
 *
 * The entry point is `apps/api/src/seed/verify-ledger.ts`, a three-line script that
 * delegates here; the logic lives in the module so it is covered by the same lint and
 * type-check gates as everything else.
 *
 * Exit code is the contract: `0` when the book is sound, `1` on any finding. CI and the
 * nightly job depend on it, so the report goes to stdout as JSON and nothing else does.
 */
@Module({
  imports: [AppConfigModule, ClockModule, DatabaseModule, LedgerModule],
})
class LedgerVerificationModule {}

/** Runs the verification and returns the process exit code. Never throws past bootstrap. */
export async function runLedgerVerificationCli(args: readonly string[]): Promise<number> {
  const repair = args.includes(REPAIR_FLAG);
  const context = await NestFactory.createApplicationContext(LedgerVerificationModule, {
    logger: ['error', 'warn'],
  });

  try {
    const report = repair
      ? await context.get(LedgerRepairService).verifyAndRepair()
      : await context.get(LedgerVerifierService).verify();

    print(report);
    return report.healthy ? EXIT_HEALTHY : EXIT_DRIFT;
  } finally {
    await context.close();
  }
}

const REPAIR_FLAG = '--repair';
const EXIT_HEALTHY = 0;
const EXIT_DRIFT = 1;

/** stdout carries the report and only the report, so the command is pipeable. */
function print(report: LedgerVerificationReport): void {
  process.stdout.write(`${JSON.stringify(report, null, JSON_INDENT)}\n`);
}

const JSON_INDENT = 2;
