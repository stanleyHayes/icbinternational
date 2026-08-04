/**
 * Deterministic faker instances for tests.
 *
 * Every test that generates random-looking data should use a seeded faker: a failure
 * CI saw last Tuesday must be reproducible today. The default seed is fixed for the
 * whole repo; suites that need their own stream derive one with `createSeededFaker`.
 */

import { Faker, base, en, en_GB } from '@faker-js/faker';

/** Repo-wide default seed. A failing test prints the seed it ran with. */
export const DEFAULT_TEST_SEED = 20_260_101;

/**
 * Builds a faker pinned to `seed`. Same seed, same sequence — always.
 *
 * The locale is GB English on purpose: Reliance Bank is a UK bank, so names,
 * addresses and phone numbers should look like the market we simulate. The generic
 * `en` locale sits behind it as a fallback for the definitions `en_GB` lacks.
 */
export function createSeededFaker(seed: number = DEFAULT_TEST_SEED): Faker {
  const faker = new Faker({ locale: [en_GB, en, base] });
  faker.seed(seed);
  return faker;
}

/**
 * The shared, pre-seeded instance. Reach for `createSeededFaker` when a suite must
 * not consume the shared stream (ordering changes would shift every downstream value).
 */
export const testFaker: Faker = createSeededFaker();
