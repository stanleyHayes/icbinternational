/**
 * The ledger's own components.
 *
 * Anything that renders double-entry — an entry with both its sides, a report indented by
 * the chart of accounts, the assertion that the book foots — lives here rather than in a
 * single screen, because the same figures appear in transaction operations, in finance
 * reporting and in the reconciliation workbench, and they must read identically in all
 * three.
 */

export { BalanceAssertion, type BalanceAssertionProps } from './balance-assertion';
export { contraLedgerCode, customerLeg, entryBalance, type EntryBalance } from './entry-balance';
export { JournalEntryView, type JournalEntryViewProps } from './journal-entry-view';
export { adjustmentFor, exceptionColumns, SIDE_LABEL } from './reconciliation-columns';
export { ReconciliationSummary, type ReconciliationSummaryProps } from './reconciliation-summary';
export { ReconciliationWorkbench } from './reconciliation-workbench';
export { exportReportLines, exportTrialBalance } from './report-export';
export { ReportTable, type ReportTableProps } from './report-table';
export { TrialBalanceTable, type TrialBalanceTableProps } from './trial-balance-table';
