/**
 * A register: a headed panel around a table of whatever a query returned.
 *
 * Nine screens had written the same three nested elements — `Panel`, then `QueryState`,
 * then `DataTable` — and the nesting was the only thing they had in common; everything
 * that mattered was in the props. Naming the shape leaves each screen stating what its
 * register *is* rather than how it is assembled, and makes the loading and failure states
 * something a new screen gets by default instead of something its author remembers.
 *
 * `flush` is set here rather than exposed: a panel whose entire body is a table always
 * wants its own padding removed, and every one of the nine had said so individually.
 */

'use client';

import { DataTable, type DataTableProps } from '@/components/shell/ops';

import { QueryState, type RetryableQuery } from './async-state';
import { Panel } from './panel';

export type RegisterPanelProps<Row> = DataTableProps<Row> & {
  readonly title: string;
  readonly description?: string;
  /** Trailing control for the panel header, e.g. a refresh button. */
  readonly action?: React.ReactNode;
  readonly query: RetryableQuery;
  /** What failed to load, e.g. "the approval queue". Used in the failure heading. */
  readonly subject: string;
};

export function RegisterPanel<Row>({
  title,
  description,
  action,
  query,
  subject,
  ...table
}: RegisterPanelProps<Row>) {
  return (
    <Panel
      title={title}
      {...(description === undefined ? {} : { description })}
      {...(action === undefined ? {} : { action })}
      flush
    >
      <QueryState query={query} subject={subject}>
        <DataTable {...(table as DataTableProps<Row>)} />
      </QueryState>
    </Panel>
  );
}
