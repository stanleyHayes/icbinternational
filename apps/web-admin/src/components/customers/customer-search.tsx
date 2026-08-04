/**
 * Finding the right person.
 *
 * Support and compliance both start here, and both arrive with a fragment: half an email
 * address, a surname, a customer id pasted out of a ticket. So one field takes all three
 * and the platform decides what it matched, rather than making the operator choose a
 * search mode before they know what they have.
 *
 * The typed query is held back briefly before it is sent. Searching on every keystroke
 * over the whole customer base produces a queue of requests whose answers arrive out of
 * order, and the operator watches the table flicker between two states.
 */

'use client';

import { useDeferredValue, useState } from 'react';

import { UserStatus } from '@reliance/contracts';
import { Input } from '@reliance/ui';

import {
  ConsoleScreen,
  KYC_TIER_OPTIONS,
  QueueError,
  QueueLoading,
} from '@/components/compliance/kit';
import { DataTable, FilterBar, type FilterSpec } from '@/components/shell/ops';
import { humaniseCode } from '@/lib/format';

import { CUSTOMER_COLUMNS } from './customer-columns';
import { useCustomerSearch, type CustomerSearchFilters } from './data/use-customers';

const STATUS_OPTIONS = Object.values(UserStatus).map((status) => ({
  value: status,
  label: humaniseCode(status),
}));

const FILTERS: readonly FilterSpec[] = [
  { id: 'status', label: 'Status', kind: 'select', options: STATUS_OPTIONS },
  { id: 'kycTier', label: 'Verification', kind: 'select', options: KYC_TIER_OPTIONS },
  {
    id: 'segment',
    label: 'Segment',
    kind: 'select',
    options: [
      { value: 'PERSONAL', label: 'Personal' },
      { value: 'BUSINESS', label: 'Business' },
    ],
  },
];

const DESCRIPTION =
  'Search by name, email address, telephone number or customer identifier. Opening a record is ' +
  'recorded against your staff account and the customer can ask us who has looked at it.';

const SEARCH_LABEL = 'Name, email, telephone or identifier';

interface SearchFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
}

function SearchField({ value, onChange }: SearchFieldProps) {
  return (
    <label className="flex w-full max-w-md flex-col gap-1">
      <span className="font-body text-fg-muted text-xs font-medium">{SEARCH_LABEL}</span>
      <Input
        type="search"
        value={value}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** The customer search screen. */
export function CustomerSearch() {
  const [term, setTerm] = useState('');
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const deferredTerm = useDeferredValue(term);

  const criteria: CustomerSearchFilters = { ...filters, search: deferredTerm };
  const query = useCustomerSearch(criteria);

  return (
    <ConsoleScreen title="Customers" description={DESCRIPTION}>
      <SearchField value={term} onChange={setTerm} />

      {query.isPending && <QueueLoading label="customer records" />}
      {query.isError && (
        <QueueError error={query.error} subject="the customer list" onRetry={query.refetch} />
      )}

      {query.data && (
        <DataTable
          tableId="customers"
          caption="Customers matching the current search"
          rowNoun="customers"
          columns={CUSTOMER_COLUMNS}
          rows={query.data.data}
          rowKey={(customer) => customer.id}
          totalCount={query.data.page.total}
          exportName="customers"
          defaultSort={{ columnId: 'name', direction: 'asc' }}
          filterValues={filters}
          onFilterValuesChange={setFilters}
          filters={<FilterBar filters={FILTERS} values={filters} onChange={setFilters} />}
        />
      )}
    </ConsoleScreen>
  );
}
