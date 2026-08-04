/**
 * The card register's columns.
 *
 * The card is identified by its last four digits and its token, never by a PAN — the full
 * number is not in the contract, is not in this console, and an operator who needs it
 * cannot be given it. That is the point rather than a limitation.
 */

'use client';

import type { Card } from '@reliance/contracts';
import { Badge, Button, StatusPill } from '@reliance/ui';

import { toneForCard } from '@/components/ops';
import type { DataColumn } from '@/components/shell/ops';
import { formatInstant, humaniseCode, shortenId } from '@/lib/format';

/** A card is embossed with the last two digits of its expiry year, not all four. */
const YEAR_DIGITS = -2;

/** Two-digit month, so `3` reads as `03/29` rather than `3/29`. */
function expiry(card: Card): string {
  return `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(YEAR_DIGITS)}`;
}

/** What the card is, whose it is, and what state it is in. */
const REGISTER_COLUMNS: readonly DataColumn<Card>[] = [
  {
    id: 'last4',
    header: 'Card',
    alwaysVisible: true,
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-mono">•••• {row.last4}</span>
        <span className="text-fg-muted text-xs">{row.cardholderName}</span>
      </span>
    ),
    csv: (row) => `•••• ${row.last4} ${row.cardholderName}`,
    sortValue: (row) => row.cardholderName,
  },
  {
    id: 'scheme',
    header: 'Scheme',
    cell: (row) => (
      <span className="flex items-center gap-1.5">
        {humaniseCode(row.scheme)}
        <Badge>{humaniseCode(row.format)}</Badge>
      </span>
    ),
    csv: (row) => `${row.scheme} ${row.format}`,
  },
  { id: 'tier', header: 'Tier', cell: (row) => humaniseCode(row.tier), csv: (row) => row.tier },
  {
    id: 'status',
    header: 'Status',
    alwaysVisible: true,
    cell: (row) => <StatusPill tone={toneForCard(row.status)} label={humaniseCode(row.status)} />,
    csv: (row) => row.status,
    sortValue: (row) => row.status,
  },
  {
    id: 'account',
    header: 'Account',
    cell: (row) => (
      <span className="font-mono text-xs" title={row.accountId}>
        {shortenId(row.accountId)}
      </span>
    ),
    csv: (row) => row.accountId,
  },
  { id: 'currency', header: 'Currency', cell: (row) => row.currency, csv: (row) => row.currency },
  { id: 'expiry', header: 'Expires', cell: (row) => expiry(row), csv: (row) => expiry(row) },
  {
    id: 'orderedAt',
    header: 'Ordered (UTC)',
    cell: (row) => <span className="font-mono text-xs">{formatInstant(row.orderedAt)}</span>,
    csv: (row) => row.orderedAt,
    sortValue: (row) => row.orderedAt,
  },
  {
    id: 'replaces',
    header: 'Replaces',
    cell: (row) => (row.replacesCardId ? shortenId(row.replacesCardId) : '—'),
    csv: (row) => row.replacesCardId ?? '',
  },
];

/** The register's columns, bound to the screen's inspector. */
export function cardColumns(onOpen: (card: Card) => void): readonly DataColumn<Card>[] {
  return [
    ...REGISTER_COLUMNS,
    {
      id: 'open',
      header: 'Manage',
      alwaysVisible: true,
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => onOpen(row)}>
          Open
        </Button>
      ),
      csv: (row) => row.id,
    },
  ];
}
