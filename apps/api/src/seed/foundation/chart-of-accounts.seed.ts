import { Injectable } from '@nestjs/common';

import { GlSeederService } from '../../modules/gl/gl-seeder.service.js';
import { LEDGER_ACCOUNT_COLLECTION } from '../../modules/ledger/ledger.constants.js';
import { type SeedOutcome, type Seeder } from '../seed.types.js';

/**
 * The chart of accounts, as a foundation seeder.
 *
 * `GlSeederService` already owned the write — but only `pnpm gl:seed` ever called it, so a
 * database that had been through `pnpm seed` or `pnpm demo:reset` still had no GL. Nothing
 * surfaced that until the first posting, which failed with "GL account 1050 does not
 * exist" from inside the ledger, a long way from the seed that omitted it.
 *
 * The chart is reference data in exactly the sense currencies and products are: static,
 * idempotent, and required before the system can do anything. Registering it here means
 * every path that seeds reference data seeds all of it, rather than each caller having to
 * remember a second command.
 *
 * This is an adapter, not a second writer. `GlSeederService` remains the only thing that
 * writes `chart_of_accounts`; this translates its result into the `SeedOutcome` the seed
 * summary reports in.
 */
@Injectable()
export class ChartOfAccountsSeeder implements Seeder {
  readonly name = 'chart-of-accounts';

  constructor(private readonly gl: GlSeederService) {}

  async run(): Promise<SeedOutcome> {
    const result = await this.gl.seedChartOfAccounts();

    return {
      collection: LEDGER_ACCOUNT_COLLECTION,
      inserted: result.created,
      // The GL seeder rewrites nothing: a row whose type has drifted from the static chart
      // is an error it raises, not a difference it reconciles.
      updated: 0,
      unchanged: result.existing,
    };
  }
}
