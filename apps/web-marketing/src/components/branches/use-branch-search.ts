'use client';

import { useCallback, useMemo, useState } from 'react';

import { LocationKind, type BankLocation } from '@reliance/contracts';

import { distanceMetres, type Coordinates } from '@/lib/geo';

/** The "show everything" value of the kind filter. */
export const ANY_KIND = 'ALL';

/** How long to wait for a position fix before giving up, in milliseconds. */
const GEOLOCATION_TIMEOUT_MS = 10_000;

const LOCATION_FAILED = 'We could not read your location. Search by town or postcode instead.';

function matchesKind(location: BankLocation, kind: string): boolean {
  if (kind === ANY_KIND) return true;
  if (kind === LocationKind.BRANCH) return location.kind !== LocationKind.ATM;
  return location.kind !== LocationKind.BRANCH;
}

function matchesQuery(location: BankLocation, query: string): boolean {
  if (query.length === 0) return true;
  const haystack = `${location.name} ${location.city} ${location.postalCode} ${location.addressLine}`;
  return haystack.toLowerCase().includes(query);
}

/** Everything the finder needs, kept out of the component that renders it. */
export interface BranchSearch {
  readonly query: string;
  readonly setQuery: (value: string) => void;
  readonly kind: string;
  readonly setKind: (value: string) => void;
  readonly results: readonly BankLocation[];
  readonly locating: boolean;
  readonly locate: () => void;
  /** Announced in the finder's live region. Never empty. */
  readonly status: string;
}

/**
 * Filtering, sorting and optional proximity for the branch finder.
 *
 * The whole network arrives with the page, so this never touches the network: searching is
 * as fast as typing, and it keeps working on a train.
 */
export function useBranchSearch(locations: readonly BankLocation[]): BranchSearch {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<string>(ANY_KIND);
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState('');

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = locations
      .filter((location) => matchesKind(location, kind) && matchesQuery(location, needle))
      .map((location) =>
        origin === null
          ? location
          : { ...location, distanceMetres: distanceMetres(origin, location) },
      );

    if (origin === null) return filtered;
    return [...filtered].sort(
      (left, right) => (left.distanceMetres ?? 0) - (right.distanceMetres ?? 0),
    );
  }, [locations, query, kind, origin]);

  const locate = useCallback(() => {
    setLocating(true);
    setFailure('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setFailure(LOCATION_FAILED);
      },
      { timeout: GEOLOCATION_TIMEOUT_MS },
    );
  }, []);

  const status =
    failure ||
    (origin ? 'Sorted by distance from where you are.' : 'Sorted alphabetically by town.');

  return { query, setQuery, kind, setKind, results, locating, locate, status };
}
