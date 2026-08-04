import { Controller, Get, Param, Query } from '@nestjs/common';

import { ErrorCode, Permission, routes, type JournalEntry } from '@reliance/contracts';
import { type CurrencyCode } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { JournalEntryStore, type JournalEntryRecord } from '../ledger/repositories/journal-entry.store.js';
import { AdminEndpoint } from '../rbac/index.js';

/** Map a persisted `JournalEntryRecord` to the contracts `JournalEntry` wire shape. */
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

const ADMIN_PAGE = 50;

/** Admin console: ledger journal entry inspection. */
@Controller()
export class AdminJournalEntriesController {
  constructor(private readonly entries: JournalEntryStore) {}

  /**
   * `GET /admin/journal-entries?afterId=` — chronological scan, newest-batch first.
   *
   * Uses `scanFrom()` with `afterId` as the pagination cursor.
   */
  @Get(routes.admin.journalEntries)
  @AdminEndpoint(Permission.TRANSACTION_READ)
  async list(@Query('afterId') afterId?: string): Promise<{ data: JournalEntry[]; hasMore: boolean }> {
    const records = await this.entries.scanFrom({ afterId, limit: ADMIN_PAGE + 1 });
    const hasMore = records.length > ADMIN_PAGE;
    return { data: records.slice(0, ADMIN_PAGE).map(toWireEntry), hasMore };
  }

  /** `GET /admin/journal-entries/:id` */
  @Get(routes.admin.journalEntry(':id'))
  @AdminEndpoint(Permission.TRANSACTION_READ)
  async getById(@Param('id') id: string): Promise<JournalEntry> {
    const record = await this.entries.findByPublicId(id);
    if (!record) throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'Journal entry not found' });
    return toWireEntry(record);
  }
}
