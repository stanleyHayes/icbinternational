'use client';

/**
 * Everyone the customer has saved.
 *
 * Search and the favourites filter are held in component state rather than the URL because this is
 * a working list, not a view worth sharing — and a payee list in a shared link is a payee list in
 * somebody's browser history. Both narrow the query the bank runs rather than filtering a page
 * that has already been fetched, so the result is right however long the list gets.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Switch } from '@reliance/ui';

import { EmptyPanel, LinkButton, NoResultsPanel } from '@/components/shell';
import { laneRoutes, movementKeys, QueryPanel, SearchField, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { PayeeRow } from './payee-row';

const ADD_PAYEE = <LinkButton href={laneRoutes.payees.add}>Add a payee</LinkButton>;

const NO_PAYEES = (
  <EmptyPanel
    title="You have not saved anyone yet"
    description="Save the people and businesses you pay regularly, and every payment after the first takes two taps."
    action={ADD_PAYEE}
  />
);

/** Props for {@link Filters}. */
interface FiltersProps {
  readonly search: string;
  readonly onSearch: (value: string) => void;
  readonly favouritesOnly: boolean;
  readonly onFavouritesOnly: (value: boolean) => void;
}

/** Narrowing the list: free text, and the favourites switch. */
function Filters({ search, onSearch, favouritesOnly, onFavouritesOnly }: FiltersProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-4">
      <SearchField
        id="payee-search"
        label="Search your payees"
        placeholder="Search by name"
        value={search}
        onChange={onSearch}
      />
      <Switch checked={favouritesOnly} onChange={(event) => onFavouritesOnly(event.target.checked)}>
        Favourites only
      </Switch>
    </div>
  );
}

/**
 * @example <PayeesScreen />
 */
export function PayeesScreen() {
  const [search, setSearch] = useState('');
  const [favouritesOnly, setFavouritesOnly] = useState(false);

  const filters = {
    ...(search ? { search } : {}),
    ...(favouritesOnly ? { favouritesOnly: true } : {}),
  };
  const payees = useQuery({
    queryKey: movementKeys.beneficiaries.list(filters),
    queryFn: async () => (await browserApi().beneficiaries.list(filters)).data,
  });

  const filtered = search !== '' || favouritesOnly;

  return (
    <Section title="Your payees" description="Everyone you have saved, ready to pay again.">
      <Filters
        search={search}
        onSearch={setSearch}
        favouritesOnly={favouritesOnly}
        onFavouritesOnly={setFavouritesOnly}
      />

      <QueryPanel
        query={payees}
        skeletonRows={4}
        isEmpty={(list) => list.length === 0}
        empty={filtered ? <NoResultsPanel query={search} /> : NO_PAYEES}
      >
        {(list) => (
          <ul className="-mx-3 flex flex-col">
            {list.map((payee) => (
              <PayeeRow key={payee.id} payee={payee} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
