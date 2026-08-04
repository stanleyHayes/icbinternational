/**
 * The reporting calendar.
 *
 * Which report goes where, how often, and by when. Finance teams miss deadlines because
 * the obligation lives in somebody's head or in a spreadsheet they own; putting it on the
 * screen where the reports are actually produced is the cheapest control there is.
 *
 * The console does not send these — reports leave the bank through the regulatory
 * gateway, with a named signatory — so the screen states who owns each one rather than
 * offering a button that would misrepresent what happens next.
 */

'use client';

import { Badge } from '@reliance/ui';

import { Panel, TableHead } from '@/components/ops';

/** How often a report is produced. */
type Cadence = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly';

interface ScheduledReport {
  readonly id: string;
  readonly name: string;
  readonly cadence: Cadence;
  /** When it is due, relative to the period it covers. */
  readonly due: string;
  readonly recipient: string;
  readonly owner: string;
}

const SCHEDULE: readonly ScheduledReport[] = [
  {
    id: 'trial-balance',
    name: 'Trial balance',
    cadence: 'Daily',
    due: 'By 09:00 the following business day',
    recipient: 'Financial Control',
    owner: 'Ledger operations',
  },
  {
    id: 'settlement-reconciliation',
    name: 'Settlement reconciliation',
    cadence: 'Daily',
    due: 'Before the 16:00 cut-off',
    recipient: 'Payments operations',
    owner: 'Reconciliation desk',
  },
  {
    id: 'liquidity',
    name: 'Liquidity and funding position',
    cadence: 'Weekly',
    due: 'Monday, by 12:00',
    recipient: 'Treasury and the Asset and Liability Committee',
    owner: 'Treasury',
  },
  {
    id: 'profit-and-loss',
    name: 'Profit and loss',
    cadence: 'Monthly',
    due: 'Fifth working day after month end',
    recipient: 'Executive committee',
    owner: 'Financial Control',
  },
  {
    id: 'balance-sheet',
    name: 'Balance sheet',
    cadence: 'Monthly',
    due: 'Fifth working day after month end',
    recipient: 'Executive committee',
    owner: 'Financial Control',
  },
  {
    id: 'impairment',
    name: 'Impairment and arrears provision',
    cadence: 'Monthly',
    due: 'Seventh working day after month end',
    recipient: 'Credit risk committee',
    owner: 'Credit risk',
  },
  {
    id: 'capital',
    name: 'Regulatory capital and large exposures',
    cadence: 'Quarterly',
    due: 'Six weeks after quarter end',
    recipient: 'The regulator, through the reporting gateway',
    owner: 'Regulatory reporting',
  },
];

const CADENCE_TONE = {
  Daily: 'info',
  Weekly: 'accent',
  Monthly: 'pending',
  Quarterly: 'neutral',
} as const;

const HEAD = 'px-3 py-2 text-left font-medium text-fg-muted';
const CELL = 'px-3 py-2 align-top';

function Row({ report }: Readonly<{ report: ScheduledReport }>) {
  return (
    <tr className="border-border border-b last:border-0">
      <th scope="row" className={`${CELL} text-left font-medium`}>
        {report.name}
      </th>
      <td className={CELL}>
        <Badge tone={CADENCE_TONE[report.cadence]}>{report.cadence}</Badge>
      </td>
      <td className={CELL}>{report.due}</td>
      <td className={CELL}>{report.recipient}</td>
      <td className={CELL}>{report.owner}</td>
    </tr>
  );
}

/** The bank's reporting obligations, and who owns each one. */
export function ReportingCalendar() {
  return (
    <Panel
      title="Reporting calendar"
      description="What is produced, how often, and who it goes to."
    >
      <div className="border-border overflow-x-auto rounded-md border">
        <table className="font-body w-full border-collapse text-sm">
          <caption className="sr-only">Scheduled financial and regulatory reports</caption>
          <TableHead
            className={HEAD}
            headings={['Report', 'Frequency', 'Due', 'Goes to', 'Owned by']}
          />
          <tbody>
            {SCHEDULE.map((report) => (
              <Row key={report.id} report={report} />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
