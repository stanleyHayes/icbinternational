/**
 * The reconciliation workbench.
 *
 * The internal ledger against what the rail says it settled. The two totals and their
 * difference are the headline; underneath them is the only part that is actually work —
 * the items that appear on one side and not the other, each with the control that
 * resolves it.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { ReconciliationException } from '@reliance/api-client';
import { Button, EmptyState } from '@reliance/ui';

import { AsyncState, ManualPostingDialog, opsKeys, Panel } from '@/components/ops';
import { DataTable } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';

import { BalanceAssertion } from './balance-assertion';
import { adjustmentFor, exceptionColumns } from './reconciliation-columns';
import { ReconciliationSummary } from './reconciliation-summary';

function Exceptions({
  rows,
  onAdjust,
}: Readonly<{
  rows: readonly ReconciliationException[];
  onAdjust: (exception: ReconciliationException) => void;
}>) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Everything matches"
        description="Every item on our ledger has a counterpart on the rail statement, and the reverse."
      />
    );
  }

  return (
    <DataTable
      tableId="ops-reconciliation"
      caption="Items appearing on one side of the reconciliation only"
      rowNoun="exceptions"
      columns={exceptionColumns(onAdjust)}
      rows={rows}
      rowKey={(row) => `${row.side}:${row.reference}`}
      defaultSort={{ columnId: 'at', direction: 'desc' }}
      exportName="reconciliation-exceptions"
    />
  );
}

/** Ledger against rail statement, with the exceptions listed and actionable. */
/** The result: the totals, whether they agree, and everything that did not match. */
function ReconciliationBody({
  report,
  onAdjust,
}: {
  readonly report: NonNullable<ReturnType<typeof useReconciliation>['data']>;
  readonly onAdjust: (exception: ReconciliationException) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ReconciliationSummary report={report} />
      <BalanceAssertion
        balanced={report.reconciled}
        difference={report.difference}
        subject="this reconciliation"
      />
      <Exceptions rows={report.unmatched} onAdjust={onAdjust} />
    </div>
  );
}

/** The run itself, and the way to ask for a fresh one. */
function useReconciliation() {
  const client = useApiClient();

  return useQuery({
    queryKey: opsKeys.reconciliation(),
    queryFn: async ({ signal }) => (await client.admin.reconciliation(undefined, { signal })).data,
  });
}

export function ReconciliationWorkbench() {
  const [adjusting, setAdjusting] = useState<ReconciliationException | null>(null);
  const query = useReconciliation();
  const report = query.data;
  const rerun = (): void => {
    query.refetch();
  };

  return (
    <Panel
      title="Reconciliation"
      description="What we booked against what the rail says it settled, and everything that does not match."
      action={
        <Button size="sm" variant="secondary" onClick={rerun} loading={query.isFetching}>
          Re-run
        </Button>
      }
    >
      <AsyncState
        isLoading={query.isPending}
        error={query.error}
        onRetry={rerun}
        subject="the reconciliation"
      >
        {report && <ReconciliationBody report={report} onAdjust={setAdjusting} />}
      </AsyncState>

      <ManualPostingDialog
        open={adjusting !== null}
        onClose={() => setAdjusting(null)}
        {...(adjusting ? { defaults: adjustmentFor(adjusting) } : {})}
      />
    </Panel>
  );
}
