/**
 * Financial reporting.
 *
 * The books first, because that is the question most often asked of this screen; then the
 * three statements; then the reconciliation that has to hold for any of them to mean
 * anything; then the calendar that says when each is owed and to whom.
 */

'use client';

import { Tab, TabList, TabPanel, Tabs } from '@reliance/ui';

import { ReconciliationWorkbench } from '@/components/finance';
import { OpsScreen } from '@/components/ops';

import { BooksPanel } from './books-panel';
import { FinancialReport } from './financial-report';
import { ReportingCalendar } from './reporting-calendar';

/**
 * The three period statements.
 *
 * Each renders the same component against a different report kind, so they belong in a
 * table rather than as three near-identical JSX blocks — adding a fourth statement is then
 * a row, and the amount column heading cannot drift out of step with the report it labels.
 */
const STATEMENTS = [
  {
    value: 'ledger',
    kind: 'GENERAL_LEDGER',
    title: 'General ledger',
    description: 'Movement on every ledger account over the period.',
    amountHeader: 'Movement',
    exportName: 'general-ledger',
  },
  {
    value: 'profit',
    kind: 'PROFIT_AND_LOSS',
    title: 'Profit and loss',
    description: 'Income earned and costs incurred over the period.',
    amountHeader: 'This period',
    exportName: 'profit-and-loss',
  },
  {
    value: 'balance',
    kind: 'BALANCE_SHEET',
    title: 'Balance sheet',
    description: 'What the bank owns and owes as at the end of the period.',
    amountHeader: 'Closing balance',
    exportName: 'balance-sheet',
  },
] as const;

/** Books, statements, reconciliation and the reporting calendar. */
export function ReportsScreen() {
  return (
    <OpsScreen
      title="Financial reports"
      description="The bank's books and statements, the reconciliation beneath them, and what is owed to whom."
    >
      <Tabs defaultValue="books">
        <TabList label="Financial reports">
          <Tab value="books">Books</Tab>
          <Tab value="ledger">General ledger</Tab>
          <Tab value="profit">Profit and loss</Tab>
          <Tab value="balance">Balance sheet</Tab>
          <Tab value="reconciliation">Reconciliation</Tab>
          <Tab value="calendar">Calendar</Tab>
        </TabList>

        <TabPanel value="books">
          <BooksPanel />
        </TabPanel>

        {STATEMENTS.map(({ value, ...report }) => (
          <TabPanel key={value} value={value}>
            <FinancialReport {...report} />
          </TabPanel>
        ))}

        <TabPanel value="reconciliation">
          <ReconciliationWorkbench />
        </TabPanel>

        <TabPanel value="calendar">
          <ReportingCalendar />
        </TabPanel>
      </Tabs>
    </OpsScreen>
  );
}
