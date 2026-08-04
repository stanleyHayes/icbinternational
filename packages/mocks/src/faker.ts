/**
 * The seeded random source every factory draws from.
 *
 * One shared, explicitly-seeded instance rather than the module-level `faker` default.
 * A given seed must reproduce a given fixture set exactly — that is what makes a failing
 * UI test reproducible, and what stops a screenshot diff failing because a mock invented
 * a different merchant name this morning.
 */

import { base, en, en_GB, Faker } from '@faker-js/faker';

/** Default seed. Chosen once and never changed; every fixture in the repo assumes it. */
export const DEFAULT_SEED = 20260802;

/**
 * The shared instance. Reseed it with {@link reseed}, never replace it.
 *
 * The chain ends in `base` because locale-neutral data (user-agent patterns, for one)
 * lives only there: without it, `faker.internet.userAgent()` throws "locale data
 * missing" no matter how many language locales precede it.
 */
export const faker = new Faker({ locale: [en_GB, en, base] });

/**
 * Resets the generator to a known point.
 *
 * Called by `resetMockDatabase`, so a test that reseeds and rebuilds gets byte-identical
 * fixtures. Calling it mid-suite without rebuilding the database is a good way to get
 * two entities with the same id, so prefer going through the database.
 */
export function reseed(seed: number = DEFAULT_SEED): void {
  faker.seed(seed);
}

/** Crockford base32 — the ULID alphabet, with I, L, O and U removed. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_LENGTH = 26;

/**
 * A prefixed, contract-valid identifier.
 *
 * Drawn from the seeded generator rather than a real ULID library: a real ULID encodes
 * wall-clock time, which would make every fixture set differ from the last and defeat
 * the whole point of seeding.
 */
export function mockId(prefix: string): string {
  let body = '';
  for (let index = 0; index < ULID_LENGTH; index += 1) {
    body += CROCKFORD[faker.number.int({ min: 0, max: CROCKFORD.length - 1 })];
  }
  return `${prefix}_${body}`;
}

/** An opaque non-prefixed id, for entities the contract types as a plain string. */
export function opaqueId(): string {
  return faker.string.alphanumeric({ length: 16, casing: 'lower' });
}

/** Picks one member of a const-object enum. */
export function pickEnum<T extends Record<string, string>>(source: T): T[keyof T] {
  const values = Object.values(source) as T[keyof T][];
  return faker.helpers.arrayElement(values);
}

/** Picks one member of a readonly tuple. */
export function pickOne<T>(values: readonly T[]): T {
  return faker.helpers.arrayElement(values as T[]);
}

/**
 * A UK-style postcode.
 *
 * Built from `faker.string` primitives rather than `location.zipCode(format)`, whose
 * string-format overload is deprecated — and whose locale default is a US ZIP, which
 * would fail nothing but would look wrong on every address in the app.
 */
export function postcode(): string {
  const area = faker.string.alpha({ length: 2, casing: 'upper' });
  const district = faker.number.int({ min: 1, max: 99 });
  const sector = faker.number.int({ min: 0, max: 9 });
  const unit = faker.string.alpha({ length: 2, casing: 'upper' });
  return `${area}${district} ${sector}${unit}`;
}

/** Builds `count` items from a factory. */
export function times<T>(count: number, build: (index: number) => T): T[] {
  return Array.from({ length: count }, (_unused, index) => build(index));
}
