import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { AppConfigService } from '../../config/config.service.js';
import { LedgerVerifierService } from '../../modules/ledger/ledger-verifier.service.js';
import { SeedService } from '../seed.service.js';

import { PersonaBuilderService, type BuiltPersona } from './persona-builder.service.js';
import { PERSONA_PASSWORD, PERSONAS } from './persona-definitions.js';

export interface ShowcaseReport {
  readonly personas: readonly BuiltPersona[];
  readonly totalMovements: number;
  readonly ledgerVerified: boolean;
  /**
   * Rows on the `transactions` projection — what a customer actually sees.
   *
   * Reported separately from `ledgerVerified` because the two can disagree in the one
   * direction that matters. The generator once produced 3,033 journal entries, correct
   * balances and a verified ledger, and not a single row on any statement: the projection
   * step every live path takes after posting had been skipped. Everything numeric was
   * right, so nothing failed. Counting the rows is the check that would have caught it.
   */
  readonly projectedTransactions: number;
  readonly durationMs: number;
}

/**
 * Rebuilds the bank from empty: reference data, then customers with a past.
 *
 * Destructive by design — it drops the customer-facing collections first. A showcase
 * dataset that accumulates across runs stops being reproducible after the second one, and
 * the whole value of a seeded generator is that the same seed gives the same bank.
 */
@Injectable()
export class ShowcaseService {
  private readonly logger = new Logger('Showcase');

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly seed: SeedService,
    private readonly builder: PersonaBuilderService,
    private readonly verifier: LedgerVerifierService,
    private readonly config: AppConfigService,
  ) {}

  async run(): Promise<ShowcaseReport> {
    const startedAt = Date.now();

    await this.clearCustomerData();
    await this.seed.run();

    const personas: BuiltPersona[] = [];
    for (const definition of PERSONAS) {
      personas.push(await this.builder.build(definition, this.config.simulation.seed));
    }

    const ledgerVerified = await this.verifyLedger();
    const projectedTransactions =
      (await this.connection.db?.collection('transactions').countDocuments()) ?? 0;

    return {
      personas,
      totalMovements: personas.reduce((total, persona) => total + persona.movements, 0),
      ledgerVerified,
      projectedTransactions,
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * Drops everything customer-derived, leaving reference data to be reseeded.
   *
   * Listed explicitly rather than dropping the database: a wildcard would take the
   * chart of accounts with it, and a ledger whose GL vanished mid-run fails in a way that
   * looks like a code defect rather than a missing collection.
   */
  private async clearCustomerData(): Promise<void> {
    const collections = [
      'users',
      'sessions',
      'devices',
      'accounts',
      'journal_entries',
      'transactions',
      'holds',
      'transfers',
      'beneficiaries',
      'idempotency_keys',
      'audit_events',
      'notifications',
      'limit_counters',
    ];

    const existing = new Set(
      (await this.connection.db?.listCollections().toArray())?.map((info) => info.name) ?? [],
    );

    for (const name of collections.filter((candidate) => existing.has(candidate))) {
      await this.connection.db?.collection(name).deleteMany({});
    }

    // The GL keeps its accounts but its balances are a projection of postings that no
    // longer exist, so they have to go back to zero with them.
    await this.connection.db
      ?.collection('chart_of_accounts')
      .updateMany({}, { $set: { balances: {} } });

    this.logger.log(`Cleared ${collections.length} customer collections`);
  }

  /** Rebuilds every balance from the postings and reports whether anything drifted. */
  private async verifyLedger(): Promise<boolean> {
    const report = await this.verifier.verify();

    if (!report.healthy) {
      this.logger.error(
        `LEDGER UNHEALTHY after generating the dataset — ` +
          `${report.unbalancedEntries.length} unbalanced, ` +
          `${report.ledgerAccountDrift.length} GL drift, ` +
          `${report.customerAccountDrift.length} customer drift. Do not demonstrate this.`,
      );
      return false;
    }

    this.logger.log(
      `Ledger verified across ${report.entriesScanned} entries: every balance reproduces ` +
        'from its postings, and the control total holds.',
    );
    return true;
  }
}

const MILLISECONDS_PER_SECOND = 1000;

/** The block printed at the end of `pnpm demo:reset`. Terminal only — never a screen. */
/** Reads as a count when there is one, and as a warning when there is not. */
function statementLine(rows: number): string {
  if (rows === 0) return 'EMPTY — the ledger has entries but no customer would see them';
  return `${rows.toLocaleString('en-GB')} rows on the activity feed`;
}

export function formatShowcaseSummary(report: ShowcaseReport): string {
  const lines = [
    '',
    '  Reliance Bank is ready.',
    '',
    `  ${report.personas.length} customers · ${report.totalMovements.toLocaleString('en-GB')} movements · ${Math.round(report.durationMs / MILLISECONDS_PER_SECOND)}s`,
    `  Ledger: ${report.ledgerVerified ? 'verified, every balance reproduces from its postings' : 'DRIFTED — investigate before demonstrating'}`,
    `  Statements: ${statementLine(report.projectedTransactions)}`,
    '',
    `  Sign in at http://localhost:3001 with the password: ${PERSONA_PASSWORD}`,
    '',
  ];

  for (const persona of report.personas) {
    lines.push(`  ${persona.email}`);
    lines.push(`    ${persona.name} — ${persona.demonstrates}`);
    for (const account of persona.accounts) {
      lines.push(`    · ${account.label} (${account.number})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
