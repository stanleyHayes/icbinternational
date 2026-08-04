/**
 * The customer's cards, as a support agent needs to see them.
 *
 * Only the last four digits exist anywhere in this system — the contract has no field for
 * a full card number, so there is nothing here to mask, leak or accidentally log. The
 * columns that matter on a call are the state and the controls: "frozen", "contactless
 * off", "online payments blocked" are the answers to almost every card question a
 * customer rings about, and they are the ones a queue view usually hides.
 */

'use client';

import type { Card } from '@reliance/contracts';
import { Badge, EmptyState, StatusPill } from '@reliance/ui';

import { QueueError, QueueLoading, ScreenPanel } from '@/components/compliance/kit';
import { DataTable, type DataColumn } from '@/components/shell/ops';
import { formatInstant, humaniseCode } from '@/lib/format';

import { useCustomerCards } from '../data/use-dossier';

const CARD_TONE = {
  ACTIVE: 'success',
  FROZEN: 'warning',
  LOST: 'danger',
  STOLEN: 'danger',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
  INACTIVE: 'neutral',
  ORDERED: 'pending',
  PRINTING: 'pending',
  SHIPPED: 'pending',
  DELIVERED: 'pending',
} as const;

/** The channel switches, named the way the customer's app names them. */
const CHANNELS = [
  ['onlinePayments', 'online payments'],
  ['contactless', 'contactless'],
  ['atmWithdrawals', 'cash machines'],
  ['internationalPayments', 'payments abroad'],
  ['magstripe', 'magnetic stripe'],
] as const;

/** Which of the customer's controls are switched off, in words. */
function restrictions(card: Card): string {
  const off: string[] = CHANNELS.filter(([key]) => !card.controls[key]).map(([, label]) => label);
  if (card.controls.blockedMccs.length > 0) off.push('some merchant categories');
  return off.length === 0 ? 'None' : off.join(', ');
}

const CARD_COLUMNS: readonly DataColumn<Card>[] = [
  {
    id: 'card',
    header: 'Card',
    alwaysVisible: true,
    cell: (card) => (
      <span className="flex flex-col">
        <span className="font-body text-fg text-sm font-medium">
          {card.nickname ?? `${humaniseCode(card.tier)} ${humaniseCode(card.format)}`}
        </span>
        <span className="text-fg-muted font-mono text-xs">
          {humaniseCode(card.scheme)} ending {card.last4}
        </span>
      </span>
    ),
    csv: (card) => `${humaniseCode(card.scheme)} ending ${card.last4}`,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (card) => <StatusPill tone={CARD_TONE[card.status]} label={humaniseCode(card.status)} />,
    csv: (card) => humaniseCode(card.status),
  },
  {
    id: 'holder',
    header: 'Cardholder',
    cell: (card) => <span className="font-body text-fg text-sm">{card.cardholderName}</span>,
    csv: (card) => card.cardholderName,
  },
  {
    id: 'expiry',
    header: 'Expires',
    cell: (card) => (
      <span className="text-fg-muted font-mono text-xs">
        {String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}
      </span>
    ),
    csv: (card) => `${card.expiryMonth}/${card.expiryYear}`,
    sortValue: (card) => card.expiresAt,
  },
  {
    id: 'controls',
    header: 'Switched off',
    cell: (card) => <span className="font-body text-fg-muted text-xs">{restrictions(card)}</span>,
    csv: (card) => restrictions(card),
  },
  {
    id: 'pin',
    header: 'PIN',
    cell: (card) => (
      <Badge tone={card.pinSet ? 'neutral' : 'warning'}>{card.pinSet ? 'Set' : 'Not set'}</Badge>
    ),
    csv: (card) => (card.pinSet ? 'Set' : 'Not set'),
  },
  {
    id: 'ordered',
    header: 'Ordered',
    cell: (card) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(card.orderedAt)}</span>
    ),
    csv: (card) => formatInstant(card.orderedAt),
    sortValue: (card) => card.orderedAt,
  },
  {
    id: 'activated',
    header: 'Activated',
    cell: (card) => (
      <span className="text-fg-muted font-mono text-xs">{formatInstant(card.activatedAt)}</span>
    ),
    csv: (card) => formatInstant(card.activatedAt),
  },
];

export interface CardsTabProps {
  readonly customerId: string;
  readonly accountIds: readonly string[];
}

/** Cards issued against this customer's accounts. */
export function CardsTab({ customerId, accountIds }: CardsTabProps) {
  const cards = useCustomerCards(customerId, accountIds);

  return (
    <ScreenPanel title="Cards" flush>
      {cards.isLoading && <QueueLoading label="cards" />}
      {cards.isError && (
        <QueueError error={cards.error} subject="this customer's cards" onRetry={cards.refetch} />
      )}
      {!cards.isLoading && !cards.isError && (
        <DataTable
          tableId="customer-cards"
          caption="Cards issued against this customer's accounts"
          rowNoun="cards"
          columns={CARD_COLUMNS}
          rows={cards.data ?? []}
          rowKey={(card) => card.id}
          exportName="customer-cards"
          defaultSort={{ columnId: 'ordered', direction: 'desc' }}
          empty={
            <EmptyState
              title="No cards issued"
              description="This customer has not been issued a debit or credit card."
            />
          }
        />
      )}
    </ScreenPanel>
  );
}
