import { Injectable } from '@nestjs/common';

import { ErrorCode, type LedgerAccount, type LedgerAccountType } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { AppConfigService } from '../../config/config.service.js';
import { findGlAccount } from '../../domain/ledger/chart-of-accounts.js';

import { GlTotalsRepository } from './gl-totals.repository.js';
import { toLedgerAccount } from './ledger-account.mapper.js';
import { LedgerAccountRepository } from './ledger-account.repository.js';
import { type GlChartAccountDocument } from './schemas/ledger-account.schema.js';
import { netBalance } from './trial-balance.builder.js';

/** What an administrator supplies when adding a row to the chart. */
export interface CreateLedgerAccountInput {
  readonly code: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly isControlAccount?: boolean;
}

const ENTITY = 'Ledger account';

/**
 * Admin operations on the chart of accounts.
 *
 * The chart changes rarely and carefully: rows are never deleted (history references
 * them), and `code` and `type` never change (postings denormalise both). Rows whose code
 * belongs to the domain's static chart are protected from rename and deactivation — the
 * domain's recipes and the ledger's recipes refer to them by code, so their meaning is
 * part of the code, not configuration.
 */
@Injectable()
export class GlAccountsService {
  constructor(
    private readonly accounts: LedgerAccountRepository,
    private readonly totals: GlTotalsRepository,
    private readonly ids: IdGenerator,
    private readonly config: AppConfigService,
  ) {}

  /** The whole chart with each account's net balance in the bank's base currency. */
  async listAccounts(): Promise<LedgerAccount[]> {
    const currency = this.config.bank.baseCurrency;
    const [rows, totals] = await Promise.all([
      this.accounts.listAll(),
      this.totals.totalsByAccount(currency),
    ]);

    const totalsByCode = new Map(totals.map((row) => [row.code, row]));
    return rows.map((row) =>
      toLedgerAccount(row, netBalance(row.type, totalsByCode.get(row.code), currency)),
    );
  }

  /** One account by GL code, with its net base-currency balance. */
  async getAccount(code: string): Promise<LedgerAccount> {
    const row = await this.accounts.findByCode(code);
    if (!row) throw AppError.notFound(ENTITY, code);

    const currency = this.config.bank.baseCurrency;
    const totals = (await this.totals.totalsByAccount(currency)).find(
      (rowTotals) => rowTotals.code === code,
    );
    return toLedgerAccount(row, netBalance(row.type, totals, currency));
  }

  /**
   * Adds a row to the chart.
   *
   * A duplicate code is a conflict, reported by the unique index rather than a
   * read-before-write — two simultaneous creates would both pass the read.
   */
  async createAccount(input: CreateLedgerAccountInput): Promise<LedgerAccount> {
    const result = await this.accounts.insertUnique({
      id: this.ids.generate('ledgerAccount'),
      code: input.code,
      name: input.name,
      type: input.type,
      isControlAccount: input.isControlAccount ?? false,
    });

    if (result.conflict) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        `Ledger account ${input.code} already exists in the chart`,
      );
    }

    return toLedgerAccount(result.account, this.zeroBalance());
  }

  /** Renames a manually-created account. Static-chart rows are protected. */
  async renameAccount(code: string, name: string): Promise<LedgerAccount> {
    const existing = await this.accounts.findByCode(code);
    if (!existing) throw AppError.notFound(ENTITY, code);
    assertMutable(existing);

    const updated = await this.accounts.patchByCode(code, { name });
    if (!updated) throw AppError.notFound(ENTITY, code);
    return this.getAccount(code);
  }

  /**
   * Retires a manually-created account.
   *
   * An account with a non-zero balance in any supported currency cannot be retired:
   * deactivating it would strand value on a row that no longer accepts postings.
   */
  async deactivateAccount(code: string): Promise<LedgerAccount> {
    const existing = await this.accounts.findByCode(code);
    if (!existing) throw AppError.notFound(ENTITY, code);
    assertMutable(existing);

    await this.assertZeroBalance(existing);

    const updated = await this.accounts.patchByCode(code, { active: false });
    if (!updated) throw AppError.notFound(ENTITY, code);
    return this.getAccount(code);
  }

  private async assertZeroBalance(account: GlChartAccountDocument): Promise<void> {
    for (const currency of this.config.bank.currencies) {
      const totals = await this.totals.totalsByAccount(currency);
      const own = totals.find((row) => row.code === account.code);
      if (!netBalance(account.type, own, currency).isZero) {
        throw new AppError({
          code: ErrorCode.PRECONDITION_FAILED,
          message: `Ledger account ${account.code} carries a non-zero ${currency} balance`,
        });
      }
    }
  }

  /** A newly created account has, by construction, no postings and no balance. */
  private zeroBalance(): Money {
    return Money.zero(this.config.bank.baseCurrency);
  }
}

/** Static-chart rows are referred to by code in domain recipes and must not drift. */
function assertMutable(account: GlChartAccountDocument): void {
  if (findGlAccount(account.code)) {
    throw new AppError({
      code: ErrorCode.PRECONDITION_FAILED,
      message: `Ledger account ${account.code} is part of the static chart and cannot be changed`,
    });
  }
}
