/**
 * Getting a report out of the console and into a spreadsheet.
 *
 * Finance work does not end on screen: a trial balance is tied out against the previous
 * close, a profit and loss is pasted into a board pack. The export therefore carries the
 * minor units exactly as the ledger holds them rather than a formatted, localised string
 * an analyst would have to unpick before they could add it up.
 */

import type { ReportLine } from '@reliance/api-client';
import type { TrialBalance } from '@reliance/contracts';

import { csvFilename, downloadCsv, toCsv, type CsvColumn } from '@/lib/csv';

type TrialBalanceLine = TrialBalance['lines'][number];

const TRIAL_BALANCE_COLUMNS: readonly CsvColumn<TrialBalanceLine>[] = [
  { header: 'Code', value: (line) => line.code },
  { header: 'Account', value: (line) => line.name },
  { header: 'Type', value: (line) => line.type },
  { header: 'Debit (minor units)', value: (line) => line.debit.amount },
  { header: 'Credit (minor units)', value: (line) => line.credit.amount },
  { header: 'Currency', value: (line) => line.debit.currency },
];

const REPORT_COLUMNS: readonly CsvColumn<ReportLine>[] = [
  { header: 'Code', value: (line) => line.code },
  { header: 'Line', value: (line) => line.label },
  { header: 'Depth', value: (line) => String(line.depth) },
  { header: 'Subtotal', value: (line) => (line.isSubtotal ? 'yes' : 'no') },
  { header: 'Amount (minor units)', value: (line) => line.amount.amount },
  { header: 'Prior period (minor units)', value: (line) => line.comparativeAmount?.amount ?? '' },
  { header: 'Currency', value: (line) => line.amount.currency },
];

/**
 * Downloads a trial balance.
 *
 * @param balance The report as the platform returned it.
 * @param at Wall-clock instant used only to name the file for the person who asked for it.
 */
export function exportTrialBalance(balance: TrialBalance, at: string): void {
  downloadCsv(
    csvFilename(`trial-balance-${balance.currency.toLowerCase()}`, at),
    toCsv(TRIAL_BALANCE_COLUMNS, balance.lines),
  );
}

/** Downloads a profit and loss, balance sheet or general ledger. */
export function exportReportLines(name: string, lines: readonly ReportLine[], at: string): void {
  downloadCsv(csvFilename(name, at), toCsv(REPORT_COLUMNS, lines));
}
