import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { CHART_OF_ACCOUNTS } from '../../domain/ledger/chart-of-accounts.js';
import { LEDGER_TRANSACTION_LABEL } from '../ledger/ledger.constants.js';

import { LedgerAccountRepository, type NewLedgerAccount } from './ledger-account.repository.js';

/** What a seeding run did, for logs and the CLI script. */
export interface SeedChartResult {
  /** Rows inserted by this run. */
  readonly created: number;
  /** Rows already present and left untouched. */
  readonly existing: number;
  /** Total rows in the static chart. */
  readonly total: number;
}

/**
 * Writes the §3.2 chart of accounts into `chart_of_accounts`.
 *
 * The domain's static `CHART_OF_ACCOUNTS` is the definition; this service is the only
 * writer that copies it to the database, so the collection and the code cannot silently
 * disagree about what the seeded chart is. Seeding is idempotent — rerunning changes
 * nothing — and runs inside a transaction so a half-seeded chart is not a state the
 * database can be left in.
 *
 * A row that already exists with a different type than the static chart is drift, not
 * something to repair quietly: the run fails loudly instead of papering over it.
 */
@Injectable()
export class GlSeederService {
  private readonly logger = new Logger(GlSeederService.name);

  constructor(
    private readonly accounts: LedgerAccountRepository,
    private readonly ids: IdGenerator,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Upserts the static chart. Safe to run at boot, from the CLI, or repeatedly. */
  async seedChartOfAccounts(): Promise<SeedChartResult> {
    return this.transactions.run(
      async (session) => {
        const rows = this.rows();
        const created = await this.accounts.insertSeededMany(rows, session);
        await this.assertNoDrift();

        const result: SeedChartResult = {
          created,
          existing: rows.length - created,
          total: rows.length,
        };
        this.logger.log(
          `Chart of accounts seeded: ${result.created} created, ${result.existing} already present`,
        );
        return result;
      },
      { label: LEDGER_TRANSACTION_LABEL.SEED_CHART },
    );
  }

  /** Every seeded row must exist with the type the domain expects. */
  private async assertNoDrift(): Promise<void> {
    for (const entry of CHART_OF_ACCOUNTS) {
      const stored = await this.accounts.findByCode(entry.code);
      if (stored && stored.type !== entry.type) {
        throw new AppError({
          code: ErrorCode.PRECONDITION_FAILED,
          message:
            `Ledger account ${entry.code} exists with type ${stored.type}, ` +
            `expected ${entry.type} — refusing to seed over drift`,
          context: { code: entry.code, storedType: stored.type, expectedType: entry.type },
        });
      }
    }
  }

  private rows(): NewLedgerAccount[] {
    return CHART_OF_ACCOUNTS.map((entry) => ({
      id: this.ids.generate('ledgerAccount'),
      code: entry.code,
      name: entry.name,
      type: entry.type,
      isControlAccount: entry.isControlAccount,
    }));
  }
}
