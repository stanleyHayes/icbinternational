/**
 * The hold register's columns.
 *
 * A hold is value the customer can no longer spend without a posting having been made,
 * so the register shows what was reserved, why, and when it lapses. The expiry is the
 * column an operator scans: a hold nobody released and nobody captured is an amount the
 * customer has been locked out of for no reason anyone can now explain.
 */

'use client';

import type { Hold } from '@reliance/contracts';
import { MoneyText, StatusPill } from '@reliance/ui';

import { toneForHold } from '@/components/ops';
import type { DataColumn } from '@/components/shell/ops';
import { formatElapsed, formatInstant, humaniseCode, shortenId } from '@/lib/format';

/** Whose funds are held, why, and how much. */
const REGISTER_COLUMNS: readonly DataColumn<Hold>[] = [
  {
    id: 'account',
    header: 'Account',
    alwaysVisible: true,
    cell: (row) => (
      <span className="font-mono text-xs" title={row.accountId}>
        {shortenId(row.accountId)}
      </span>
    ),
    csv: (row) => row.accountId,
  },
  {
    id: 'description',
    header: 'Description',
    alwaysVisible: true,
    cell: (row) => row.description,
    csv: (row) => row.description,
  },
  {
    id: 'reason',
    header: 'Reason',
    cell: (row) => humaniseCode(row.reason),
    csv: (row) => row.reason,
  },
  {
    id: 'amount',
    header: 'Held',
    align: 'end',
    cell: (row) => (
      <MoneyText amount={row.amount.amount} currency={row.amount.currency} size="sm" muted />
    ),
    csv: (row) => row.amount.amount,
    sortValue: (row) => BigInt(row.amount.amount),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusPill tone={toneForHold(row.status)} label={humaniseCode(row.status)} />,
    csv: (row) => row.status,
  },
  {
    id: 'placedAt',
    header: 'Placed (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.placedAt)}</span>,
    csv: (row) => row.placedAt,
    sortValue: (row) => row.placedAt,
  },
  {
    id: 'resolvedAt',
    header: 'Resolved (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.resolvedAt)}</span>,
    csv: (row) => row.resolvedAt ?? '',
  },
];

/** The register's columns. `nowMs` drives the lapse countdown. */
export function holdColumns(nowMs: number): readonly DataColumn<Hold>[] {
  return [
    ...REGISTER_COLUMNS,
    {
      id: 'expiresAt',
      header: 'Lapses',
      cell: (row) => (
        <span title={row.expiresAt ?? 'No expiry set'}>
          {row.expiresAt ? formatElapsed(row.expiresAt, nowMs) : 'No expiry'}
        </span>
      ),
      csv: (row) => row.expiresAt ?? '',
      sortValue: (row) => row.expiresAt ?? '',
    },
  ];
}
