/**
 * The screening workstation.
 *
 * Sanctions, politically exposed persons, adverse media and our own watchlist come
 * through one queue because they are worked the same way and, more importantly, because
 * separating them would let an analyst clear the sanctions tab and go home with four
 * internal-watchlist hits open. The list type is a filter, not a different screen.
 *
 * The internal watchlist is visible here as a filter of its own. Names the bank has added
 * itself are screened, adjudicated and audited by the same path as an official list —
 * anything else turns into a spreadsheet somebody maintains by hand.
 */

'use client';

import { useState } from 'react';

import type { ScreeningHit } from '@reliance/api-client';

import {
  ConsoleScreen,
  MetricRow,
  MetricTile,
  openColumn,
  QueueError,
  QueueLoading,
  scoreBand,
  ScreenPanel,
} from '@/components/compliance/kit';
import { DataTable, FilterBar, type DataColumn, type FilterSpec } from '@/components/shell/ops';
import { formatCount } from '@/lib/format';

import { useScreeningQueue } from '../data/use-screening';

import { SCREENING_COLUMNS } from './screening-columns';
import { ScreeningComparison } from './screening-comparison';

const DESCRIPTION =
  'Name matches against sanctions lists, politically exposed person registers, adverse media ' +
  'and our own watchlist. Every hit is closed with a reason, including the ones we discount.';

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'status',
    label: 'Adjudication',
    kind: 'select',
    options: [
      { value: 'OPEN', label: 'Open' },
      { value: 'TRUE_MATCH', label: 'True match' },
      { value: 'FALSE_POSITIVE', label: 'Discounted' },
      { value: 'ESCALATED', label: 'Escalated' },
    ],
  },
  {
    id: 'matchType',
    label: 'List type',
    kind: 'select',
    options: [
      { value: 'SANCTIONS', label: 'Sanctions' },
      { value: 'PEP', label: 'Politically exposed' },
      { value: 'ADVERSE_MEDIA', label: 'Adverse media' },
      { value: 'INTERNAL_WATCHLIST', label: 'Our watchlist' },
    ],
  },
  {
    id: 'minScore',
    label: 'Minimum confidence',
    kind: 'text',
    placeholder: '0–100',
  },
];

/** Adds the compare control to the display columns. */
function withCompare(
  openId: string | null,
  onOpen: (hitId: string) => void,
): readonly DataColumn<ScreeningHit>[] {
  return [
    ...SCREENING_COLUMNS,
    openColumn<ScreeningHit>({
      header: 'Compare',
      idOf: (hit) => hit.id,
      openId,
      onOpen,
    }),
  ];
}

interface QueueProps {
  readonly queue: ReturnType<typeof useScreeningQueue>;
  readonly columns: readonly DataColumn<ScreeningHit>[];
  readonly rows: readonly ScreeningHit[];
  readonly filters: Readonly<Record<string, string>>;
  readonly onFiltersChange: (filters: Readonly<Record<string, string>>) => void;
}

function Queue({ queue, columns, rows, filters, onFiltersChange }: QueueProps) {
  if (queue.isPending) return <QueueLoading label="screening hits" />;
  if (queue.isError) {
    return <QueueError error={queue.error} subject="the screening queue" onRetry={queue.refetch} />;
  }

  return (
    <DataTable
      tableId="screening-queue"
      caption="Screening hits awaiting adjudication"
      rowNoun="hits"
      columns={columns}
      rows={rows}
      rowKey={(hit) => hit.id}
      exportName="screening-hits"
      defaultSort={{ columnId: 'score', direction: 'desc' }}
      filterValues={filters}
      onFilterValuesChange={onFiltersChange}
      filters={<FilterBar filters={FILTERS} values={filters} onChange={onFiltersChange} />}
    />
  );
}

interface ScreeningTilesProps {
  readonly open: number;
  readonly strong: number;
  readonly escalated: number;
  readonly shown: number;
}

function ScreeningTiles(props: ScreeningTilesProps) {
  return (
    <MetricRow>
      <MetricTile label="Open hits" value={formatCount(props.open)} />
      <MetricTile
        label="Strong matches open"
        value={formatCount(props.strong)}
        detail={props.strong === 0 ? 'Nothing above 85% is waiting' : 'Decide these first'}
        urgent={props.strong > 0}
      />
      <MetricTile label="With a senior analyst" value={formatCount(props.escalated)} />
      <MetricTile label="Shown by this filter" value={formatCount(props.shown)} />
    </MetricRow>
  );
}

/** The screening screen. */
export function ScreeningConsole() {
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const queue = useScreeningQueue(filters);

  const rows = queue.data ?? [];
  const open = rows.filter((hit) => hit.status === 'OPEN');
  const strong = open.filter((hit) => scoreBand(hit.matchScore) === 'strong');
  const escalated = rows.filter((hit) => hit.status === 'ESCALATED');
  const selected = rows.find((hit) => hit.id === openId) ?? null;

  return (
    <ConsoleScreen title="Screening" description={DESCRIPTION}>
      <ScreeningTiles
        open={open.length}
        strong={strong.length}
        escalated={escalated.length}
        shown={rows.length}
      />

      <ScreenPanel title="Queue" flush>
        <Queue
          queue={queue}
          columns={withCompare(openId, setOpenId)}
          rows={rows}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </ScreenPanel>

      <ScreenPanel title="Side-by-side comparison">
        <ScreeningComparison hit={selected} onDecided={() => setOpenId(null)} />
      </ScreenPanel>
    </ConsoleScreen>
  );
}
