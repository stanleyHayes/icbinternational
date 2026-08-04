'use client';

/**
 * The repayment schedule, instalment by instalment.
 *
 * Rendered row-for-row from the API rather than recomputed in the browser. A schedule the customer
 * can check against their statement has to be the schedule the ledger will actually post, and any
 * arithmetic done here would eventually disagree with it in the final penny.
 */

import type { AmortisationRow } from '@reliance/contracts';
import { StatusPill, Table, type TableColumn, type Tone } from '@reliance/ui';

import { MoneyCell } from '@/components/transfers';
import { formatDate } from '@/lib/format';

/** How each instalment's state reads. */
const ROW_STATUS: Readonly<Record<AmortisationRow['status'], { label: string; tone: Tone }>> = {
  SCHEDULED: { label: 'Due', tone: 'neutral' },
  PAID: { label: 'Paid', tone: 'credit' },
  PARTIAL: { label: 'Part paid', tone: 'pending' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
  WAIVED: { label: 'Waived', tone: 'info' },
};

const COLUMNS: TableColumn<AmortisationRow>[] = [
  { id: 'instalment', header: 'No.', cell: (row) => row.instalment },
  { id: 'due', header: 'Due', cell: (row) => formatDate(row.dueDate) },
  {
    id: 'payment',
    header: 'Payment',
    align: 'end',
    cell: (row) => <MoneyCell money={row.payment} muted />,
  },
  {
    id: 'principal',
    header: 'Of which capital',
    align: 'end',
    cell: (row) => <MoneyCell money={row.principal} muted />,
  },
  {
    id: 'interest',
    header: 'Of which interest',
    align: 'end',
    cell: (row) => <MoneyCell money={row.interest} muted />,
  },
  {
    id: 'closing',
    header: 'Left to pay',
    align: 'end',
    cell: (row) => <MoneyCell money={row.closingBalance} muted />,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => (
      <StatusPill tone={ROW_STATUS[row.status].tone} label={ROW_STATUS[row.status].label} />
    ),
  },
];

/** Props for {@link AmortisationTable}. */
export interface AmortisationTableProps {
  readonly rows: readonly AmortisationRow[];
}

/**
 * @example <AmortisationTable rows={schedule} />
 */
export function AmortisationTable({ rows }: AmortisationTableProps) {
  return (
    <Table
      caption="Every instalment, what it pays off and what is left afterwards"
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => String(row.instalment)}
    />
  );
}
