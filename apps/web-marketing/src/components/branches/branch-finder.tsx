'use client';

import { LocateFixed, Search } from 'lucide-react';

import { LocationKind, type BankLocation } from '@reliance/contracts';
import { Button, EmptyState, FormField, Input, Select } from '@reliance/ui';

import { BranchCard } from './branch-card';
import { ANY_KIND, useBranchSearch, type BranchSearch } from './use-branch-search';

const ICON_SIZE = 18;

const KIND_OPTIONS = [
  { value: ANY_KIND, label: 'Branches and cash machines' },
  { value: LocationKind.BRANCH, label: 'Branches only' },
  { value: LocationKind.ATM, label: 'Cash machines only' },
] as const;

/**
 * The branch and cash machine finder.
 *
 * "Use my location" is opt-in and never called on load: a bank asking for a location the
 * moment a page opens is asking for something it has not yet earned. Searching by town or
 * postcode is a complete alternative, not a fallback.
 */
export function BranchFinder({ locations }: { readonly locations: readonly BankLocation[] }) {
  const search = useBranchSearch(locations);

  return (
    <div className="grid gap-8 lg:grid-cols-[20rem_1fr] lg:items-start">
      <SearchPanel search={search} />
      <ResultsList results={search.results} />
    </div>
  );
}

function SearchFields({ search }: { readonly search: BranchSearch }) {
  return (
    <>
      <FormField label="Town, city or postcode">
        <Input
          type="search"
          name="query"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          prefix={<Search size={ICON_SIZE} aria-hidden />}
          placeholder="Bristol or BS1 4DJ"
        />
      </FormField>

      <FormField label="Show">
        <Select
          name="kind"
          options={KIND_OPTIONS}
          value={search.kind}
          onChange={(event) => search.setKind(event.target.value)}
        />
      </FormField>
    </>
  );
}

function SearchPanel({ search }: { readonly search: BranchSearch }) {
  return (
    <form
      className="border-border bg-surface space-y-5 rounded-xl border p-6 lg:sticky lg:top-24"
      onSubmit={(event) => event.preventDefault()}
    >
      <h2 className="font-display text-fg text-lg font-semibold">Find one near you</h2>

      <SearchFields search={search} />

      <Button
        type="button"
        variant="secondary"
        fullWidth
        loading={search.locating}
        onClick={search.locate}
        startIcon={<LocateFixed size={ICON_SIZE} aria-hidden />}
      >
        Use my location
      </Button>

      <p aria-live="polite" className="text-fg-muted text-sm">
        {search.status}
      </p>
    </form>
  );
}

function ResultsList({ results }: { readonly results: readonly BankLocation[] }) {
  return (
    <div>
      <p aria-live="polite" className="text-fg-muted mb-4 text-sm">
        {results.length === 1 ? '1 location' : `${String(results.length)} locations`}
      </p>

      {results.length === 0 ? (
        <EmptyState
          title="Nothing here matches that search"
          description="Try a nearby town, a shorter postcode, or clear the filter to see the whole network."
        />
      ) : (
        <ul className="space-y-4">
          {results.map((location) => (
            <BranchCard key={location.id} location={location} />
          ))}
        </ul>
      )}
    </div>
  );
}
