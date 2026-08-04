/**
 * One financial report, over a period the operator chooses.
 *
 * The general ledger, the profit and loss and the balance sheet share this component
 * because they differ only in which lines the platform returns. The period controls are
 * part of the report rather than global state: a controller comparing December against
 * November has both open in two tabs, and a shared date range would move both.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { FinancialReport as Report } from '@reliance/api-client';
import { Alert, Button, FormField, Input, Switch } from '@reliance/ui';

import { exportReportLines, ReportTable } from '@/components/finance';
import { Panel, QueryState, opsKeys } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { formatInstant } from '@/lib/format';

/** Which report is being run. */
export type ReportKind = Report['report'];

/** The reporting currency. */
const CURRENCY = 'GBP';

export interface FinancialReportProps {
  readonly kind: ReportKind;
  readonly title: string;
  readonly description: string;
  /** Heading over the figures column, e.g. "Movement" or "Closing balance". */
  readonly amountHeader: string;
  /** Base filename for the export. */
  readonly exportName: string;
}

interface PeriodProps {
  readonly from: string;
  readonly to: string;
  readonly comparative: boolean;
  readonly onChange: (patch: { from?: string; to?: string; comparative?: boolean }) => void;
}

function PeriodControls({ from, to, comparative, onChange }: PeriodProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <FormField label="From">
        <Input
          type="date"
          value={from}
          onChange={(event) => onChange({ from: event.target.value })}
        />
      </FormField>
      <FormField label="To">
        <Input type="date" value={to} onChange={(event) => onChange({ to: event.target.value })} />
      </FormField>
      <Switch
        checked={comparative}
        onChange={(event) => onChange({ comparative: event.target.checked })}
      >
        Show the prior period
      </Switch>
    </div>
  );
}

function useReport(kind: ReportKind, period: Readonly<Record<string, string>>) {
  const client = useApiClient();
  const query = { currency: CURRENCY, ...period };

  return useQuery({
    queryKey: opsKeys.report(kind, period),
    queryFn: async ({ signal }) => {
      const request = { ...query, comparative: period.comparative === 'yes' };
      if (kind === 'PROFIT_AND_LOSS')
        return (await client.admin.profitAndLoss(request, { signal })).data;
      if (kind === 'BALANCE_SHEET')
        return (await client.admin.balanceSheet(request, { signal })).data;
      return (await client.admin.generalLedger(request, { signal })).data;
    },
  });
}

/** A financial report with its period controls and export. */
type Period = Readonly<Record<string, string>>;

interface PeriodChange {
  readonly from?: string;
  readonly to?: string;
  readonly comparative?: boolean;
}

/**
 * Applies a period change, leaving untouched fields alone.
 *
 * Each field is checked for `undefined` rather than spread, because the controls report
 * only what changed and spreading would clear the other two on every edit.
 */
function withPeriod(period: Period, change: PeriodChange): Period {
  const next = { ...period };
  if (change.from !== undefined) next.from = change.from;
  if (change.to !== undefined) next.to = change.to;
  if (change.comparative !== undefined) next.comparative = change.comparative ? 'yes' : '';
  return next;
}

/** The report itself, once it has arrived. */
function ReportBody({
  report,
  title,
  amountHeader,
  comparative,
}: {
  readonly report: NonNullable<ReturnType<typeof useReport>['data']>;
  readonly title: string;
  readonly amountHeader: string;
  readonly comparative: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {!report.balanced && (
        <Alert tone="danger" title="The underlying ledger does not foot">
          Every figure below is derived from a book that does not balance. Do not circulate this
          report until Financial Control has cleared it.
        </Alert>
      )}
      <ReportTable
        caption={`${title} for ${report.periodStart} to ${report.periodEnd}`}
        lines={report.lines}
        amountHeader={amountHeader}
        comparative={comparative}
      />
      <p className="font-body text-fg-muted text-xs">
        Generated {formatInstant(report.generatedAt)} in {report.currency}.
      </p>
    </div>
  );
}

/** Disabled until there is something to export, so the button never produces an empty file. */
function ExportButton({
  report,
  exportName,
}: {
  readonly report: ReturnType<typeof useReport>['data'];
  readonly exportName: string;
}) {
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={!report}
      onClick={() =>
        report && exportReportLines(exportName, report.lines, new Date().toISOString())
      }
    >
      Export
    </Button>
  );
}

export function FinancialReport(props: FinancialReportProps) {
  const [period, setPeriod] = useState<Period>({});
  const query = useReport(props.kind, period);
  const report = query.data;

  const patch = (change: PeriodChange): void => setPeriod(withPeriod(period, change));

  return (
    <Panel
      title={props.title}
      description={props.description}
      action={<ExportButton report={report} exportName={props.exportName} />}
    >
      <div className="flex flex-col gap-4">
        <PeriodControls
          from={period.from ?? ''}
          to={period.to ?? ''}
          comparative={period.comparative === 'yes'}
          onChange={patch}
        />

        <QueryState query={query} subject="this report">
          {report && (
            <ReportBody
              report={report}
              title={props.title}
              amountHeader={props.amountHeader}
              comparative={period.comparative === 'yes'}
            />
          )}
        </QueryState>
      </div>
    </Panel>
  );
}
