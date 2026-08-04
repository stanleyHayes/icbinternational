'use client';

/**
 * An account's statements.
 *
 * A real table, because that is what this is: a screen-reader user needs to hear "Closing
 * balance, column 4, row 2" rather than a wall of figures. Opening and closing balances are shown
 * alongside the period so the archive reconciles down the page — each statement's closing balance
 * is the next one's opening balance, and a customer checking that is doing exactly the right
 * thing.
 */

import { FileDown } from 'lucide-react';

import type { Statement } from '@reliance/contracts';
import {
  Button,
  Card,
  CardHeader,
  MoneyText,
  Skeleton,
  Table,
  type TableColumn,
} from '@reliance/ui';

import { EmptyPanel } from '@/components/shell';
import { describeError } from '@/lib/errors';
import { formatDate } from '@/lib/format';

import { useStatements } from './use-accounts';

const COLUMNS: readonly TableColumn<Statement>[] = [
  {
    id: 'period',
    header: 'Period',
    cell: (statement) =>
      `${formatDate(statement.periodStart)} – ${formatDate(statement.periodEnd)}`,
    sortValue: (statement) => statement.periodStart,
  },
  {
    id: 'opening',
    header: 'Opening balance',
    align: 'end',
    cell: (statement) => (
      <MoneyText
        amount={statement.openingBalance.amount}
        currency={statement.openingBalance.currency}
        size="sm"
        muted
      />
    ),
  },
  {
    id: 'in',
    header: 'Paid in',
    align: 'end',
    cell: (statement) => (
      <MoneyText
        amount={statement.totalCredits.amount}
        currency={statement.totalCredits.currency}
        size="sm"
      />
    ),
  },
  {
    id: 'out',
    header: 'Paid out',
    align: 'end',
    cell: (statement) => (
      <MoneyText
        amount={`-${statement.totalDebits.amount.replace('-', '')}`}
        currency={statement.totalDebits.currency}
        size="sm"
        signed
      />
    ),
  },
  {
    id: 'closing',
    header: 'Closing balance',
    align: 'end',
    cell: (statement) => (
      <MoneyText
        amount={statement.closingBalance.amount}
        currency={statement.closingBalance.currency}
        size="sm"
        muted
      />
    ),
  },
  {
    id: 'download',
    header: 'Statement',
    align: 'end',
    cell: (statement) =>
      statement.downloadUrl ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => globalThis.open(statement.downloadUrl ?? '', '_blank', 'noopener')}
          startIcon={<FileDown aria-hidden="true" className="size-4" />}
        >
          <span className="sr-only">{`Download the statement for ${statement.period} as a PDF`}</span>
          <span aria-hidden="true">PDF</span>
        </Button>
      ) : (
        <span className="text-fg-muted text-sm">Being prepared</span>
      ),
  },
];

/** Props for {@link StatementArchive}. */
export interface StatementArchiveProps {
  readonly accountId: string;
}

/**
 * @example <StatementArchive accountId={account.id} />
 */
export function StatementArchive({ accountId }: StatementArchiveProps) {
  const statements = useStatements(accountId);

  if (statements.isPending) return <Skeleton className="h-64 w-full" />;

  if (statements.isError) {
    const described = describeError(statements.error);
    return <EmptyPanel title={described.title} description={described.message} />;
  }

  if (statements.data.length === 0) {
    return (
      <EmptyPanel
        title="No statements yet"
        description="We produce a statement at the end of each month. The first one will appear here once this account has been open for a full month."
      />
    );
  }

  return (
    <Card flush>
      <div className="p-5 pb-0">
        <CardHeader
          title="Statement archive"
          description="Monthly statements, kept for six years. Each closing balance is the next month's opening balance."
        />
      </div>
      <Table
        caption="Statements for this account, newest first"
        columns={COLUMNS}
        rows={statements.data}
        rowKey={(statement) => statement.id}
        defaultSort={{ columnId: 'period', direction: 'desc' }}
      />
    </Card>
  );
}
