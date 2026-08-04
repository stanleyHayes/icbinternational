'use client';

/**
 * The totals above the list.
 *
 * These figures are the sum of the rows underneath them — the same movements, from the same
 * request, added in `bigint`. That is the whole point of the shared window loader: a customer who
 * filters to "Groceries, March" and reads "£274.50 out" can scroll down and add the rows up by
 * hand, and they will match.
 *
 * `aria-live` because the numbers change when a filter changes, and the person who just chose
 * that filter is the person who most needs to hear the answer.
 */

import { Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { CurrencyCode } from '@reliance/money';
import { Alert, Button, Card, cn, MoneyText, Skeleton, TEXT_STYLE } from '@reliance/ui';

import { nowMs } from '@/lib/clock';
import { describeError } from '@/lib/errors';

import { COLLECTION_LIMIT } from './collect';
import { csvFileName, downloadCsv, toCsv } from './csv';
import type { TransactionFilters } from './filters';
import type { TransactionTotals } from './totals';
import { useTransactionTotals, useTransactionWindow } from './use-transactions';

function Figure({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="min-w-32 flex-1">
      <p className={cn(TEXT_STYLE.caption, 'text-xs tracking-wide uppercase')}>{label}</p>
      <p className="mt-1 flex min-h-8 items-center">{children}</p>
    </div>
  );
}

function Loading() {
  return <Skeleton className="h-6 w-24" />;
}

/** The four figures, once they are known. */
function Figures({ totals }: { readonly totals: TransactionTotals }) {
  const { currency } = totals;

  return (
    <>
      <Figure label="Movements">
        <span className={cn(TEXT_STYLE.numeric, 'text-lg font-medium')}>{totals.count}</span>
      </Figure>
      <Figure label="Money in">
        <MoneyText amount={totals.receivedMinor.toString()} currency={currency} size="lg" />
      </Figure>
      <Figure label="Money out">
        <MoneyText amount={(-totals.spentMinor).toString()} currency={currency} size="lg" signed />
      </Figure>
      <Figure label="Net">
        <MoneyText amount={totals.netMinor.toString()} currency={currency} size="lg" signed />
      </Figure>
    </>
  );
}

const PENDING_FIGURES = ['Movements', 'Money in', 'Money out', 'Net'] as const;

function PendingFigures() {
  return (
    <>
      {PENDING_FIGURES.map((label) => (
        <Figure key={label} label={label}>
          <Loading />
        </Figure>
      ))}
    </>
  );
}

/** Caveats that must travel with a total, rather than being left for the customer to discover. */
function Caveats({ totals }: { readonly totals: TransactionTotals }) {
  const excluded = totals.excludedCount;

  return (
    <>
      {totals.truncated ? (
        <Alert tone="warning" title="Showing the most recent movements">
          {`This period holds more than ${COLLECTION_LIMIT.toLocaleString('en-GB')} movements, so the totals and the download cover the most recent ones only. Narrow the dates for a figure that covers everything.`}
        </Alert>
      ) : null}

      {excluded > 0 ? (
        <Alert tone="info" title="Other currencies are listed separately">
          {`These totals cover your ${totals.currency} movements. ${excluded} other movement${excluded === 1 ? ' is' : 's are'} shown below but not added in — a single figure spanning currencies would be out of date the moment the rate moved.`}
        </Alert>
      ) : null}
    </>
  );
}

interface StripProps {
  readonly totals: TransactionTotals | null;
  readonly onDownload: () => void;
  readonly canDownload: boolean;
}

/** The figures, and the control that turns them into a file. */
function Strip({ totals, onDownload, canDownload }: StripProps) {
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      <div aria-live="polite" className="flex flex-1 flex-wrap gap-x-8 gap-y-4">
        {totals ? <Figures totals={totals} /> : <PendingFigures />}
      </div>
      <Button
        variant="secondary"
        onClick={onDownload}
        disabled={!canDownload}
        startIcon={<Download aria-hidden="true" className="size-4" />}
      >
        Download CSV
      </Button>
    </div>
  );
}

/** Props for {@link WindowSummary}. */
export interface WindowSummaryProps {
  readonly filters: TransactionFilters;
  readonly currency: CurrencyCode;
}

const DOWNLOAD_FAILED =
  'We could not prepare that file. Try again, or narrow the dates and download a shorter period.';

/**
 * @example <WindowSummary filters={filters} currency="GBP" />
 */
export function WindowSummary({ filters, currency }: WindowSummaryProps) {
  const collection = useTransactionWindow(filters);
  const { totals, error } = useTransactionTotals(filters, currency);
  const [failure, setFailure] = useState<string | null>(null);

  const download = (): void => {
    const collected = collection.data;
    if (!collected) return;
    try {
      downloadCsv(toCsv(collected.transactions), csvFileName(new Date(nowMs()).toISOString()));
      setFailure(null);
    } catch {
      setFailure(DOWNLOAD_FAILED);
    }
  };

  if (error) {
    return (
      <Alert tone="warning" title="We could not total these movements">
        {describeError(error).message}
      </Alert>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <Strip totals={totals} onDownload={download} canDownload={Boolean(collection.data)} />
      {failure ? (
        <Alert tone="danger" title="Download failed">
          {failure}
        </Alert>
      ) : null}
      {totals ? <Caveats totals={totals} /> : null}
    </Card>
  );
}
