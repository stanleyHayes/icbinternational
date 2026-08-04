/**
 * The branch and ATM directory.
 *
 * A proximity search is a two-pass operation: a bounding box the database can answer from
 * an index, then an exact haversine distance over the survivors. Sorting by distance in
 * the query would mean computing it for every branch in the country on every search.
 */

import { Injectable } from '@nestjs/common';

import { LocationKind, type BankLocation } from '@reliance/contracts';

import { ContentKind, MAX_SEARCH_RADIUS_METRES, NEAREST_LOCATION_COUNT } from '../cms.constants.js';
import { ContentStore, type ContentRecord } from '../content.store.js';

import { boundingBox, distanceMetres, toDecimalDegrees, type Point } from './geo.js';

/** Locations returned when no proximity filter is applied. */
const BROWSE_LIMIT = 200;

export interface LocationSearch {
  readonly near?: Point;
  readonly radiusMetres?: number;
  readonly kind?: LocationKind;
  /** Matches the name, city or postcode. */
  readonly query?: string;
  readonly limit?: number;
}

@Injectable()
export class LocationService {
  constructor(private readonly content: ContentStore) {}

  /**
   * Finds locations, nearest first when a point is supplied.
   *
   * `distanceMetres` on each result is populated only for a proximity search — the
   * contract makes it nullable precisely so a browse result does not have to invent one.
   */
  async search(search: LocationSearch): Promise<BankLocation[]> {
    const candidates = await this.candidatesFor(search);

    const filtered = candidates
      .filter((record) => matchesKind(record, search.kind))
      .filter((record) => matchesQuery(record, search.query));

    if (!search.near) {
      return filtered
        .slice(0, search.limit ?? BROWSE_LIMIT)
        .map((record) => toLocation(record, null));
    }

    const radius = Math.min(
      search.radiusMetres ?? MAX_SEARCH_RADIUS_METRES,
      MAX_SEARCH_RADIUS_METRES,
    );
    const centre = search.near;

    return filtered
      .map((record) => ({ record, metres: distanceFrom(centre, record) }))
      .filter((entry): entry is { record: ContentRecord; metres: number } => entry.metres !== null)
      .filter((entry) => entry.metres <= radius)
      .sort((left, right) => left.metres - right.metres)
      .slice(0, search.limit ?? NEAREST_LOCATION_COUNT)
      .map((entry) => toLocation(entry.record, entry.metres));
  }

  /** One location by its slug, or null when it is not published. */
  async findBySlug(slug: string): Promise<BankLocation | null> {
    const record = await this.content.findPublished(ContentKind.LOCATION, slug);
    return record ? toLocation(record, null) : null;
  }

  /**
   * The candidate set.
   *
   * A proximity search narrows to a bounding box in the query; a browse or a text search
   * reads the published locations and filters in memory. The directory is a few hundred
   * rows, so the second path is cheap and the alternative — a text index on a collection
   * shared with pages and blog posts — is not.
   */
  private async candidatesFor(search: LocationSearch): Promise<ContentRecord[]> {
    if (!search.near) {
      return this.content.listPublished(ContentKind.LOCATION, BROWSE_LIMIT);
    }

    const radius = Math.min(
      search.radiusMetres ?? MAX_SEARCH_RADIUS_METRES,
      MAX_SEARCH_RADIUS_METRES,
    );
    const found = await this.content.listInBoundingBox(boundingBox(search.near, radius));
    return found.filter((record) => record.kind === ContentKind.LOCATION);
  }
}

function distanceFrom(centre: Point, record: ContentRecord): number | null {
  if (record.latitudeMicro === null || record.longitudeMicro === null) return null;
  return distanceMetres(centre, {
    latitudeMicro: record.latitudeMicro,
    longitudeMicro: record.longitudeMicro,
  });
}

function matchesKind(record: ContentRecord, kind: LocationKind | undefined): boolean {
  if (!kind) return true;
  const recordKind = readString(record, 'kind');
  return recordKind === kind || recordKind === LocationKind.BOTH || kind === LocationKind.BOTH;
}

function matchesQuery(record: ContentRecord, query: string | undefined): boolean {
  if (!query) return true;
  const needle = query.trim().toLowerCase();

  return [record.title, readString(record, 'city'), readString(record, 'postalCode')]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(needle));
}

/**
 * Reads a string out of the opaque payload.
 *
 * The payload is `Record<string, unknown>` by design — one collection serves eight kinds —
 * so reads are narrowed here rather than asserted at each call site.
 */
function readString(record: ContentRecord, key: string): string {
  const value = record.payload[key];
  return typeof value === 'string' ? value : '';
}

function readBoolean(record: ContentRecord, key: string): boolean {
  return record.payload[key] === true;
}

function readStrings(record: ContentRecord, key: string): string[] {
  const value = record.payload[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** Payload → the contract's `BankLocation`. */
function toLocation(record: ContentRecord, metres: number | null): BankLocation {
  const hours = record.payload.openingHours;

  return {
    id: record.id,
    kind: (readString(record, 'kind') || LocationKind.BRANCH) as LocationKind,
    name: record.title,
    addressLine: readString(record, 'addressLine'),
    city: readString(record, 'city'),
    postalCode: readString(record, 'postalCode'),
    country: readString(record, 'country') as BankLocation['country'],
    latitude: toDecimalDegrees(record.latitudeMicro ?? 0),
    longitude: toDecimalDegrees(record.longitudeMicro ?? 0),
    phone: readString(record, 'phone') || null,
    services: readStrings(record, 'services'),
    openingHours: Array.isArray(hours) ? (hours as BankLocation['openingHours']) : [],
    wheelchairAccessible: readBoolean(record, 'wheelchairAccessible'),
    hasDepositMachine: readBoolean(record, 'hasDepositMachine'),
    distanceMetres: metres,
  };
}
