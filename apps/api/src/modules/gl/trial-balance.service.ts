import { Injectable } from '@nestjs/common';

import { type TrialBalance } from '@reliance/contracts';
import { type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppConfigService } from '../../config/config.service.js';

import { GlTotalsRepository } from './gl-totals.repository.js';
import { LedgerAccountRepository } from './ledger-account.repository.js';
import { buildTrialBalance } from './trial-balance.builder.js';

/**
 * The trial balance: gross debits versus gross credits across the whole book, per currency.
 *
 * It must sum to zero. When it does not, something has bypassed the ledger's balancing
 * invariant and the report says so (`balanced: false`) rather than hiding it — see the
 * domain glossary, "Trial balance".
 */
@Injectable()
export class TrialBalanceService {
  constructor(
    private readonly accounts: LedgerAccountRepository,
    private readonly totals: GlTotalsRepository,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Builds the report for one currency, defaulting to the bank's base currency.
   *
   * Every active chart row appears, even with no movement: an auditor reads a missing row
   * as a missing account, not as a zero.
   */
  async trialBalance(currency?: CurrencyCode): Promise<TrialBalance> {
    const reportCurrency = currency ?? this.config.bank.baseCurrency;

    const [rows, totals] = await Promise.all([
      this.accounts.listActive(),
      this.totals.totalsByAccount(reportCurrency),
    ]);

    return buildTrialBalance({
      currency: reportCurrency,
      asOf: this.clock.now(),
      accounts: rows.map((row) => ({ code: row.code, name: row.name, type: row.type })),
      totals,
    });
  }
}
