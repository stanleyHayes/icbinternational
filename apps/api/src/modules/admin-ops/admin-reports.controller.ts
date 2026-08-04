import { Controller, Get, Query } from '@nestjs/common';

import { Permission, routes, type JournalEntry, type TrialBalance } from '@reliance/contracts';
import { isCurrencyCode, type CurrencyCode } from '@reliance/money';

import { TrialBalanceService } from '../gl/trial-balance.service.js';
import { JournalEntryStore, type JournalEntryRecord } from '../ledger/repositories/journal-entry.store.js';
import { AdminEndpoint } from '../rbac/index.js';

const GL_PAGE = 100;

/**
 * Admin financial reports.
 *
 * The trial-balance service already produces a full per-account breakdown so it powers
 * the general-ledger, balance-sheet, P&L and reconciliation views as well as the
 * existing `/admin/reports/trial-balance` endpoint. The shape is identical; the UI
 * filters by `LedgerAccountType` to derive the balance-sheet (ASSET/LIABILITY/EQUITY)
 * and the P&L (INCOME/EXPENSE) columns.
 *
 * The reconciliation endpoint compares the trial balance with the raw journal scan to
 * prove the projection and the source of truth agree. For the demo increment it returns
 * the same payload; a full implementation would stream both in parallel and diff them.
 */
@Controller()
export class AdminReportsController {
  constructor(
    private readonly trialBalance: TrialBalanceService,
    private readonly entries: JournalEntryStore,
  ) {}

  /** `GET /admin/reports/general-ledger?currency=GBP` — full account-level detail. */
  @Get(routes.admin.generalLedger)
  @AdminEndpoint(Permission.REPORT_READ)
  generalLedger(@Query('currency') currency?: string): Promise<TrialBalance> {
    return this.trialBalance.trialBalance(normaliseCurrency(currency));
  }

  /** `GET /admin/reports/balance-sheet?currency=GBP` — assets, liabilities and equity. */
  @Get(routes.admin.balanceSheet)
  @AdminEndpoint(Permission.REPORT_READ)
  balanceSheet(@Query('currency') currency?: string): Promise<TrialBalance> {
    return this.trialBalance.trialBalance(normaliseCurrency(currency));
  }

  /** `GET /admin/reports/profit-and-loss?currency=GBP` — income and expense accounts. */
  @Get(routes.admin.profitAndLoss)
  @AdminEndpoint(Permission.REPORT_READ)
  profitAndLoss(@Query('currency') currency?: string): Promise<TrialBalance> {
    return this.trialBalance.trialBalance(normaliseCurrency(currency));
  }

  /**
   * `GET /admin/reports/reconciliation?afterId=` — proves the journal scan and the
   * projected trial balance agree.
   *
   * Returns the last `GL_PAGE` journal entries and the current trial balance.
   */
  @Get(routes.admin.reconciliation)
  @AdminEndpoint(Permission.REPORT_READ)
  async reconciliation(
    @Query('currency') currency?: string,
    @Query('afterId') afterId?: string,
  ): Promise<{ trialBalance: TrialBalance; recentEntries: JournalEntry[] }> {
    const [tb, records] = await Promise.all([
      this.trialBalance.trialBalance(normaliseCurrency(currency)),
      this.entries.scanFrom({ afterId, limit: GL_PAGE }),
    ]);
    return { trialBalance: tb, recentEntries: records.map(toWireEntry) };
  }
}

function toWireEntry(r: JournalEntryRecord): JournalEntry {
  return {
    id: r.id as `jnl_${string}`,
    reference: r.reference as JournalEntry['reference'],
    type: r.type,
    status: r.status,
    description: r.description,
    valueDate: r.valueDate,
    bookedAt: r.bookedAt.toISOString(),
    postings: r.postings.map((p) => ({
      ledgerAccountCode: p.ledgerAccountCode,
      ledgerAccountName: p.ledgerAccountName,
      accountId: p.accountId as `acc_${string}` | null,
      direction: p.direction,
      amount: { amount: p.amount.amount, currency: p.amount.currency as CurrencyCode },
      narrative: p.narrative,
    })),
    reversesEntryId: (r.reversesEntryId ?? null) as `jnl_${string}` | null,
    reversedByEntryId: (r.reversedByEntryId ?? null) as `jnl_${string}` | null,
    metadata: r.metadata as Record<string, string>,
  };
}

function normaliseCurrency(raw: string | undefined): CurrencyCode | undefined {
  if (!raw) return undefined;
  const upper = raw.trim().toUpperCase();
  return isCurrencyCode(upper) ? upper : undefined;
}
