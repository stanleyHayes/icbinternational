/**
 * The card register.
 *
 * Searched by cardholder, last four digits or account, because those are the three things
 * a customer can tell an agent over the phone. Filtering happens against the page the
 * platform returned, and the screen says so rather than implying it has searched the whole
 * book.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { CardScheme, CardStatus, Permission, type Card } from '@reliance/contracts';
import { Button } from '@reliance/ui';

import { Panel, QueryState, opsKeys } from '@/components/ops';
import { DataTable, FilterBar, type FilterSpec } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { humaniseCode } from '@/lib/format';
import { Can } from '@/lib/permissions';

import { cardColumns } from './card-columns';
import { CardDrawer } from './card-drawer';
import { IssueCardDialog } from './issue-card-dialog';

/** Cards read per page. */
const PAGE_SIZE = 100;

const FILTERS: readonly FilterSpec[] = [
  {
    id: 'search',
    label: 'Cardholder, last four or account',
    kind: 'text',
    placeholder: 'Search cards',
  },
  {
    id: 'status',
    label: 'Status',
    kind: 'select',
    options: Object.values(CardStatus).map((value) => ({ value, label: humaniseCode(value) })),
  },
  {
    id: 'scheme',
    label: 'Scheme',
    kind: 'select',
    options: Object.values(CardScheme).map((value) => ({ value, label: humaniseCode(value) })),
  },
];

function matches(card: Card, filters: Readonly<Record<string, string>>): boolean {
  const search = filters.search?.trim().toLowerCase() ?? '';
  const haystack = `${card.cardholderName} ${card.last4} ${card.accountId}`.toLowerCase();

  return (
    (search === '' || haystack.includes(search)) &&
    (!filters.status || card.status === filters.status) &&
    (!filters.scheme || card.scheme === filters.scheme)
  );
}

/** Search, issue and manage cards. */
/** Every card the bank has issued, narrowed by the screen's filters. */
function useCardRegister(filters: Readonly<Record<string, string>>) {
  const client = useApiClient();

  const query = useQuery({
    queryKey: opsKeys.cards(),
    queryFn: async ({ signal }) => client.admin.cards({ limit: PAGE_SIZE }, { signal }),
  });

  const rows = useMemo(
    () => (query.data?.data ?? []).filter((card) => matches(card, filters)),
    [query.data, filters],
  );

  return { query, rows };
}

export function CardRegister() {
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const [opened, setOpened] = useState<Card | null>(null);
  const [issuing, setIssuing] = useState(false);
  const { query, rows } = useCardRegister(filters);

  return (
    <Panel
      title="Card register"
      description="Every card the bank has issued, in every state."
      action={
        <Can permission={Permission.CARD_MANAGE}>
          <Button size="sm" onClick={() => setIssuing(true)}>
            Issue a card
          </Button>
        </Can>
      }
      flush
    >
      <QueryState query={query} subject="the card register">
        <DataTable
          tableId="ops-cards"
          caption="Cards issued by the bank"
          rowNoun="cards"
          columns={cardColumns(setOpened)}
          rows={rows}
          rowKey={(row) => row.id}
          totalCount={query.data?.page.total}
          defaultSort={{ columnId: 'orderedAt', direction: 'desc' }}
          filterValues={filters}
          onFilterValuesChange={setFilters}
          exportName="cards"
          filters={<FilterBar filters={FILTERS} values={filters} onChange={setFilters} />}
        />
      </QueryState>

      <CardDrawer card={opened} onClose={() => setOpened(null)} />
      <IssueCardDialog open={issuing} onClose={() => setIssuing(false)} />
    </Panel>
  );
}
