/**
 * The audit explorer.
 *
 * Append-only, hash-chained, never edited. The explorer's job is to make a break in that
 * chain impossible to miss: the page-level check marks the exact row where the story stops
 * adding up, and the platform's own verification says whether the rest of the chain — the
 * part not on screen — still holds.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { OpsScreen, Panel, QueryState, opsKeys } from '@/components/ops';
import { AuditTrail, brokenLinks, FilterBar, type FilterSpec } from '@/components/shell/ops';
import { useApiClient } from '@/lib/api-client';
import { formatCount } from '@/lib/format';

import { ChainVerification } from './chain-verification';

/** Events read per page. */
const PAGE_SIZE = 100;

const FILTERS: readonly FilterSpec[] = [
  { id: 'actorId', label: 'Actor', kind: 'text', placeholder: 'adm_… or usr_…' },
  { id: 'entity', label: 'Record type', kind: 'text', placeholder: 'CmsPage, Account…' },
  { id: 'entityId', label: 'Record', kind: 'text', placeholder: 'Identifier' },
  { id: 'action', label: 'Action', kind: 'text', placeholder: 'updated, approved…' },
  { id: 'from', label: 'From', kind: 'date' },
  { id: 'to', label: 'To', kind: 'date' },
];

function toQuery(values: Readonly<Record<string, string>>) {
  const trimmed = (key: string): string | undefined => {
    const value = values[key]?.trim();
    return value === '' ? undefined : value;
  };

  return {
    limit: PAGE_SIZE,
    ...(trimmed('actorId') ? { actorId: trimmed('actorId') } : {}),
    ...(trimmed('entity') ? { entity: trimmed('entity') } : {}),
    ...(trimmed('entityId') ? { entityId: trimmed('entityId') } : {}),
    ...(trimmed('action') ? { action: trimmed('action') } : {}),
    ...(values.from ? { from: `${values.from}T00:00:00Z` } : {}),
    ...(values.to ? { to: `${values.to}T23:59:59Z` } : {}),
  };
}

/** Every change the bank has recorded, with the chain checked. */
export function AuditScreen() {
  const client = useApiClient();
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});

  const query = useQuery({
    queryKey: opsKeys.audit(filters),
    queryFn: async ({ signal }) => client.admin.audit(toQuery(filters), { signal }),
  });

  const events = query.data?.data ?? [];
  const broken = brokenLinks(events);

  return (
    <OpsScreen
      title="Audit trail"
      description="Every change the bank has recorded, who made it, and proof that nothing has been altered since."
    >
      <Panel
        title="Chain verification"
        description="The platform walks every link, not only the page on screen."
      >
        <ChainVerification />
      </Panel>

      <Panel
        title="Recorded changes"
        description={
          broken.size > 0
            ? `${formatCount(broken.size)} events on this page do not match the record before them.`
            : 'Newest first. A row whose link does not hold is marked in red.'
        }
      >
        <div className="flex flex-col gap-4">
          <FilterBar filters={FILTERS} values={filters} onChange={setFilters} />

          <QueryState query={query} subject="the audit trail">
            <AuditTrail events={events} subject="the bank" />
          </QueryState>
        </div>
      </Panel>
    </OpsScreen>
  );
}
