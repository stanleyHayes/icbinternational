/**
 * The authorisation log.
 *
 * Every request the card schemes sent us and what we answered. The decline column carries
 * the explanation rather than the code, because the reason an agent needs is the one they
 * can read to the customer — and a log that only prints `LIMIT_EXCEEDED` sends that agent
 * to a colleague to have it translated.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AuthorisationStatus, type CardAuthorisation } from '@reliance/contracts';
import { Badge, MoneyText, StatusPill, type Tone } from '@reliance/ui';

import { RegisterPanel, opsKeys } from '@/components/ops';
import { FilterBar, type DataColumn, type FilterSpec } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatInstant, humaniseCode, shortenId } from '@/lib/format';

import { declineSummary } from './decline-reasons';

/** Authorisations read per page. */
const PAGE_SIZE = 100;

const STATUS_TONE: Readonly<Record<AuthorisationStatus, Tone>> = {
  [AuthorisationStatus.APPROVED]: 'success',
  [AuthorisationStatus.DECLINED]: 'danger',
  [AuthorisationStatus.REVERSED]: 'neutral',
  [AuthorisationStatus.CAPTURED]: 'credit',
  [AuthorisationStatus.EXPIRED]: 'neutral',
};

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'status',
    label: 'Outcome',
    kind: 'select',
    options: Object.values(AuthorisationStatus).map((value) => ({
      value,
      label: humaniseCode(value),
    })),
  },
  { id: 'cardId', label: 'Card', kind: 'text', placeholder: 'crd_…' },
];

const COLUMNS: readonly DataColumn<CardAuthorisation>[] = [
  {
    id: 'authorisedAt',
    header: 'Requested (UTC)',
    alwaysVisible: true,
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.authorisedAt)}</span>,
    csv: (row) => row.authorisedAt,
    sortValue: (row) => row.authorisedAt,
  },
  {
    id: 'merchant',
    header: 'Merchant',
    alwaysVisible: true,
    cell: (row) => (
      <span className="flex flex-col">
        <span>{row.merchantName}</span>
        <span className="text-fg-muted text-xs">
          {row.merchantCountry} · category {row.mcc}
        </span>
      </span>
    ),
    csv: (row) => `${row.merchantName} (${row.merchantCountry}, MCC ${row.mcc})`,
  },
  {
    id: 'channel',
    header: 'Channel',
    cell: (row) => humaniseCode(row.channel),
    csv: (row) => row.channel,
  },
  {
    id: 'amount',
    header: 'Amount',
    align: 'end',
    cell: (row) => (
      <MoneyText amount={row.amount.amount} currency={row.amount.currency} size="sm" muted />
    ),
    csv: (row) => row.amount.amount,
    sortValue: (row) => BigInt(row.amount.amount),
  },
  {
    id: 'status',
    header: 'Outcome',
    alwaysVisible: true,
    cell: (row) => <StatusPill tone={STATUS_TONE[row.status]} label={humaniseCode(row.status)} />,
    csv: (row) => row.status,
  },
  {
    id: 'reason',
    header: 'What we told the merchant',
    alwaysVisible: true,
    cell: (row) => declineSummary(row.declineReason),
    csv: (row) => declineSummary(row.declineReason),
  },
  {
    id: 'threeDs',
    header: '3-D Secure',
    cell: (row) => (row.threeDsChallenged ? <Badge tone="info">Challenged</Badge> : 'Not needed'),
    csv: (row) => (row.threeDsChallenged ? 'challenged' : 'not challenged'),
  },
  {
    id: 'card',
    header: 'Card',
    cell: (row) => <span className="font-mono text-xs">{shortenId(row.cardId)}</span>,
    csv: (row) => row.cardId,
  },
];

/** Every authorisation the schemes have asked us to decide. */
export function AuthorisationLog() {
  const client = useApiClient();
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});

  const query = useQuery({
    queryKey: opsKeys.queueDepth(`authorisations:${filters.status ?? ''}:${filters.cardId ?? ''}`),
    queryFn: async ({ signal }) =>
      client.cards.authorisations(
        {
          limit: PAGE_SIZE,
          ...(filters.status ? { status: filters.status as AuthorisationStatus } : {}),
          ...(filters.cardId?.trim() ? { cardId: filters.cardId.trim() } : {}),
        },
        { signal },
      ),
  });

  return (
    <RegisterPanel
      title="Authorisation log"
      description="What the card schemes asked, what we answered, and why."
      query={query}
      subject="the authorisation log"
      tableId="ops-authorisations"
      caption="Card authorisations, newest first"
      rowNoun="authorisations"
      columns={COLUMNS}
      rows={query.data?.data ?? []}
      rowKey={(row) => row.id}
      totalCount={query.data?.page.total}
      defaultSort={{ columnId: 'authorisedAt', direction: 'desc' }}
      filterValues={filters}
      onFilterValuesChange={setFilters}
      exportName="card-authorisations"
      filters={<FilterBar filters={FILTERS} values={filters} onChange={setFilters} />}
    />
  );
}
