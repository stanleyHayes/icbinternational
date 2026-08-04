/**
 * The branch and ATM locator.
 *
 * The acceptance criterion is that a proximity search returns the nearest ten with a
 * distance on each, so the distances are checked against known real-world separations
 * rather than against whatever the implementation happens to produce.
 */

import { PublishStatus } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { DIRECTORY_CATALOGUE } from '../catalogue/directory.catalogue.js';
import { ContentKind } from '../cms.constants.js';
import { InMemoryContentStore } from '../in-memory-content.store.js';
import { boundingBox, distanceMetres, parsePoint } from '../locations/geo.js';
import { LocationService } from '../locations/location.service.js';

/** Cornhill, in the City of London. */
const LONDON = { latitudeMicro: 51_513_200, longitudeMicro: -87_400 };
/** Spinningfields, Manchester. */
const MANCHESTER = { latitudeMicro: 53_479_800, longitudeMicro: -2_252_100 };

const METRES_PER_KILOMETRE = 1000;

describe('distance', () => {
  it('is zero from a point to itself', () => {
    expect(distanceMetres(LONDON, LONDON)).toBe(0);
  });

  it('puts London and Manchester about 262 km apart', () => {
    const kilometres = distanceMetres(LONDON, MANCHESTER) / METRES_PER_KILOMETRE;

    expect(kilometres).toBeGreaterThan(255);
    expect(kilometres).toBeLessThan(270);
  });

  it('is symmetric', () => {
    expect(distanceMetres(LONDON, MANCHESTER)).toBe(distanceMetres(MANCHESTER, LONDON));
  });
});

describe('the bounding box', () => {
  it('contains every point inside the radius', () => {
    const radius = 25_000;
    const box = boundingBox(LONDON, radius);

    // A tenth of a degree north — about 11 km, comfortably inside a 25 km radius.
    const nearby = {
      latitudeMicro: LONDON.latitudeMicro + 100_000,
      longitudeMicro: LONDON.longitudeMicro,
    };

    expect(distanceMetres(LONDON, nearby)).toBeLessThan(radius);
    expect(nearby.latitudeMicro).toBeLessThanOrEqual(box.maxLatitudeMicro);
    expect(nearby.latitudeMicro).toBeGreaterThanOrEqual(box.minLatitudeMicro);
  });

  it('widens in longitude as latitude increases, because the meridians converge', () => {
    const radius = 50_000;
    const equatorial = boundingBox({ latitudeMicro: 0, longitudeMicro: 0 }, radius);
    const northern = boundingBox({ latitudeMicro: 60_000_000, longitudeMicro: 0 }, radius);

    const equatorialSpan = equatorial.maxLongitudeMicro - equatorial.minLongitudeMicro;
    const northernSpan = northern.maxLongitudeMicro - northern.minLongitudeMicro;

    expect(northernSpan).toBeGreaterThan(equatorialSpan);
  });
});

describe('parsing a coordinate from a query string', () => {
  it('accepts a well-formed pair', () => {
    expect(parsePoint('51.5132,-0.0874')).toEqual(LONDON);
  });

  it('refuses a pair outside the world', () => {
    expect(parsePoint('91.0,0.0')).toBeNull();
    expect(parsePoint('0.0,181.0')).toBeNull();
  });

  it('refuses anything that is not a pair of numbers', () => {
    expect(parsePoint('near me')).toBeNull();
    expect(parsePoint('')).toBeNull();
  });
});

describe('searching the directory', () => {
  async function buildDirectory(): Promise<LocationService> {
    const clock = new ClockService();
    const store = new InMemoryContentStore(new IdGenerator(), clock);

    for (const entry of DIRECTORY_CATALOGUE) {
      const created = await store.insert(
        {
          kind: entry.kind,
          slug: entry.slug,
          title: entry.title,
          status: PublishStatus.DRAFT,
          locale: 'en-GB',
          seo: null,
          payload: entry.payload,
          tags: entry.tags ?? [],
          order: entry.order ?? 0,
          latitudeMicro: entry.latitudeMicro ?? null,
          longitudeMicro: entry.longitudeMicro ?? null,
          scheduledFor: null,
          updatedBy: null,
        },
        clock.now(),
      );

      await store.applyStatus({
        id: created.id,
        status: PublishStatus.PUBLISHED,
        scheduledFor: null,
        publishedAt: clock.now(),
        at: clock.now(),
        by: null,
      });
    }

    return new LocationService(store);
  }

  it('returns the nearest first, with a distance on each', async () => {
    const locations = await buildDirectory();
    const found = await locations.search({ near: LONDON, radiusMetres: 200_000 });

    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.name).toBe('London Cornhill');
    expect(found[0]?.distanceMetres).toBe(0);

    const distances = found.map((entry) => entry.distanceMetres ?? 0);
    expect([...distances].sort((left, right) => left - right)).toEqual(distances);
  });

  it('returns at most the nearest ten', async () => {
    const locations = await buildDirectory();
    const found = await locations.search({ near: LONDON, radiusMetres: 1_000_000 });

    expect(found.length).toBeLessThanOrEqual(10);
  });

  it('honours the radius', async () => {
    const locations = await buildDirectory();
    const found = await locations.search({ near: LONDON, radiusMetres: 20_000 });

    expect(found.every((entry) => (entry.distanceMetres ?? 0) <= 20_000)).toBe(true);
    expect(found.some((entry) => entry.name.includes('Manchester'))).toBe(false);
  });

  it('leaves the distance null when no point is given', async () => {
    const locations = await buildDirectory();
    const found = await locations.search({});

    expect(found.length).toBeGreaterThan(0);
    expect(found.every((entry) => entry.distanceMetres === null)).toBe(true);
  });

  it('matches on city and postcode', async () => {
    const locations = await buildDirectory();

    await expect(locations.search({ query: 'Leeds' })).resolves.toHaveLength(1);
    await expect(locations.search({ query: 'EH2 4LH' })).resolves.toHaveLength(1);
  });

  it('ships a directory with real coordinates rather than one invented point', () => {
    const points = DIRECTORY_CATALOGUE.map(
      (entry) => `${entry.latitudeMicro},${entry.longitudeMicro}`,
    );

    expect(new Set(points).size).toBe(points.length);
    expect(DIRECTORY_CATALOGUE.every((entry) => entry.kind === ContentKind.LOCATION)).toBe(true);
  });
});
