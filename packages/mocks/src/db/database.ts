/**
 * The mock bank's lifecycle: build, read, reset.
 *
 * A module-level singleton, because MSW handlers are registered once and have to reach
 * the same data on every request. `resetMockDatabase()` is what a test suite calls
 * between cases, and it rebuilds from the seed rather than mutating in place — a partial
 * reset that left one collection behind would produce exactly the cross-test bleed that
 * makes a suite flaky.
 */

import { DEFAULT_SEED, reseed } from '../faker.js';

import { MockClock } from './clock.js';
import { buildDatabase } from './seed.js';
import type { MockDatabase } from './types.js';

let currentSeed = DEFAULT_SEED;
let clock = new MockClock();
let database: MockDatabase = create(currentSeed);

function create(seed: number): MockDatabase {
  reseed(seed);
  clock = new MockClock();
  return buildDatabase(seed, clock);
}

/** The live database. Handlers mutate the object this returns. */
export function db(): MockDatabase {
  return database;
}

/**
 * Rebuilds the bank.
 *
 * Pass a seed to get a different — but still reproducible — fixture set. Call it in a
 * `beforeEach`; a suite that mutates the mocks without resetting is a suite whose tests
 * pass in one order and fail in another.
 */
export function resetMockDatabase(seed: number = currentSeed): MockDatabase {
  currentSeed = seed;
  database = create(seed);
  return database;
}

/** The seed the current fixture set was built from. */
export function currentMockSeed(): number {
  return currentSeed;
}

/** The simulated clock. Shared with every fixture, so dates stay consistent. */
export function mockClock(): MockClock {
  return clock;
}
