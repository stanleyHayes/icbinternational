import { Inject, Injectable, Logger } from '@nestjs/common';

import { isNoOp, SEEDERS, totalise, type SeedOutcome, type Seeder } from './seed.types.js';

/** What a whole run did, per seeder and in total. */
export interface SeedReport {
  readonly outcomes: readonly SeedOutcome[];
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  /** True when the run changed nothing — the property the seed is tested for. */
  readonly noOp: boolean;
  readonly durationMs: number;
}

/**
 * Runs the foundation seed.
 *
 * The chart of accounts is deliberately absent: the ledger module seeds its own GL, and
 * two seeders writing the same control accounts would be two definitions of what the bank
 * owes its customers.
 *
 * Seeders run in sequence rather than in parallel. They are independent today, but a seed
 * is run once at deploy time and the ordering costs nothing, while a future dependency
 * between two of them would fail intermittently and be miserable to diagnose.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(@Inject(SEEDERS) private readonly seeders: readonly Seeder[]) {}

  /** Brings every foundation collection into line with its definition. */
  async run(): Promise<SeedReport> {
    const startedAt = process.hrtime.bigint();
    const outcomes: SeedOutcome[] = [];

    for (const seeder of this.seeders) {
      const outcome = await seeder.run();
      outcomes.push(outcome);
      this.logger.log(describe(seeder, outcome));
    }

    const totals = totalise(outcomes);

    return {
      outcomes,
      ...totals,
      noOp: isNoOp(outcomes),
      durationMs: elapsedMs(startedAt),
    };
  }
}

function describe(seeder: Seeder, outcome: SeedOutcome): string {
  return `${seeder.name}: ${outcome.inserted} inserted, ${outcome.updated} updated, ${outcome.unchanged} unchanged`;
}

function elapsedMs(startedAt: bigint): number {
  return Number((process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_MILLISECOND);
}

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;
