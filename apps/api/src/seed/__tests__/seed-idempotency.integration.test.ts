import { CURRENCY_CODES } from '@reliance/money';

import { PRODUCTS_COLLECTION } from '../../modules/products/product.constants.js';
import { BILLER_DIRECTORY } from '../foundation/billers/biller-directory.js';
import { FOUNDATION_PRODUCTS } from '../foundation/catalogue/index.js';
import { LOCATION_DIRECTORY } from '../foundation/locations/location-directory.js';
import { ROLE_DEFINITIONS } from '../foundation/roles/role-definitions.js';
import {
  BILLERS_COLLECTION,
  CURRENCIES_COLLECTION,
  LOCATIONS_COLLECTION,
  ROLES_COLLECTION,
} from '../seed.constants.js';
import { type SeedReport } from '../seed.service.js';

import {
  buildSeedHarness,
  HARNESS_BASE_CURRENCY,
  HARNESS_CURRENCIES,
  SEEDED_COLLECTIONS,
  type SeedHarness,
} from './seed-harness.js';

/**
 * The only property that really matters about a seed: running it twice does nothing the
 * second time.
 *
 * Asserted three ways, because each catches a different mistake. The report must say it
 * changed nothing; the document counts must not move; and every document must be
 * byte-identical, `updatedAt` included — a seeder that rewrites unchanged rows would pass
 * the first two and quietly churn the audit trail on every deploy.
 *
 * Requires the dev database (`pnpm db:up`).
 */

// Generous, because this suite runs ten full seeds against a real database and CI shares
// that database with every other integration suite.
jest.setTimeout(180_000);

const EXPECTED_COUNTS: ReadonlyArray<readonly [string, number]> = [
  [CURRENCIES_COLLECTION, CURRENCY_CODES.length],
  [PRODUCTS_COLLECTION, FOUNDATION_PRODUCTS.length],
  [BILLERS_COLLECTION, BILLER_DIRECTORY.length],
  [LOCATIONS_COLLECTION, LOCATION_DIRECTORY.length],
  [ROLES_COLLECTION, ROLE_DEFINITIONS.length],
];

const TOTAL_DOCUMENTS = EXPECTED_COUNTS.reduce((sum, [, count]) => sum + count, 0);

describe('the foundation seed', () => {
  let harness: SeedHarness;
  let firstRun: SeedReport;

  beforeAll(async () => {
    harness = await buildSeedHarness();
    firstRun = await harness.seed.run();
  });

  // Optional chaining because a `beforeAll` that failed leaves `harness` unassigned, and a
  // teardown that then throws replaces the real failure with a useless one.
  afterAll(async () => {
    await harness?.close();
  });

  it('populates every foundation collection on a clean database', async () => {
    expect(firstRun.noOp).toBe(false);
    expect(firstRun.updated).toBe(0);
    expect(firstRun.inserted).toBe(TOTAL_DOCUMENTS);

    for (const [collection, expected] of EXPECTED_COUNTS) {
      await expect(count(collection)).resolves.toBe(expected);
    }
  });

  it('changes nothing on a second run', async () => {
    const before = await snapshot();

    const secondRun = await harness.seed.run();

    expect(secondRun.inserted).toBe(0);
    expect(secondRun.updated).toBe(0);
    expect(secondRun.noOp).toBe(true);
    expect(secondRun.unchanged).toBe(TOTAL_DOCUMENTS);
    expect(await snapshot()).toEqual(before);
  });

  it('changes nothing on a third run either', async () => {
    const before = await snapshot();

    await expect(harness.seed.run().then((report) => report.noOp)).resolves.toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it('restores a document an operator deleted, without touching its neighbours', async () => {
    await harness.connection.collection(BILLERS_COLLECTION).deleteOne({ id: 'thames-water' });
    const before = await snapshot(BILLERS_COLLECTION);

    const outcome = outcomeFor(await harness.seed.run(), BILLERS_COLLECTION);

    expect(outcome.inserted).toBe(1);
    expect(outcome.updated).toBe(0);
    expect(outcome.unchanged).toBe(BILLER_DIRECTORY.length - 1);

    const after = await snapshot(BILLERS_COLLECTION);
    expect(after.filter((document) => document['id'] !== 'thames-water')).toEqual(before);
  });

  it('repairs a document an operator edited by hand', async () => {
    await harness.connection
      .collection(LOCATIONS_COLLECTION)
      .updateOne({ id: 'ldn-cheapside' }, { $set: { city: 'Atlantis' } });

    const outcome = outcomeFor(await harness.seed.run(), LOCATIONS_COLLECTION);

    expect(outcome.updated).toBe(1);
    expect(outcome.inserted).toBe(0);
    await expect(field(LOCATIONS_COLLECTION, { id: 'ldn-cheapside' }, 'city')).resolves.toBe(
      'London',
    );
  });

  it('never reprices an existing product version, even when the catalogue moves on', async () => {
    // A version is immutable. Rewriting v1 would retro-alter every account already sold on
    // it, so a tampered version is left exactly as found and a genuine reprice publishes v2.
    const key = { code: 'EVERYDAY_CURRENT', version: 1 };
    await harness.connection
      .collection(PRODUCTS_COLLECTION)
      .updateOne(key, { $set: { debitInterestBps: 1 } });

    const outcome = outcomeFor(await harness.seed.run(), PRODUCTS_COLLECTION);

    expect(outcome.inserted).toBe(0);
    expect(outcome.updated).toBe(0);
    await expect(field(PRODUCTS_COLLECTION, key, 'debitInterestBps')).resolves.toBe(1);
  });

  it('gives every seeded product a prefixed identifier that survives a re-run', async () => {
    const before = await productIds();

    await harness.seed.run();

    for (const id of before) expect(id).toMatch(/^prd_[\dA-HJKMNP-TV-Z]{26}$/);
    expect(await productIds()).toEqual(before);
  });

  it('marks only the configured currencies as enabled', async () => {
    const enabled = await harness.connection
      .collection(CURRENCIES_COLLECTION)
      .find({ enabled: true })
      .toArray();

    expect(enabled.map((document) => document['code']).sort()).toEqual(
      [...HARNESS_CURRENCIES].sort(),
    );
    await expect(
      field(CURRENCIES_COLLECTION, { code: HARNESS_BASE_CURRENCY }, 'isBaseCurrency'),
    ).resolves.toBe(true);
  });

  it('leaves alone a field it has no opinion about', async () => {
    // A feature module will add its own fields to these collections. The seed asserts its
    // own and is deliberately blind to the rest, so re-seeding must not revert them.
    await harness.connection
      .collection(BILLERS_COLLECTION)
      .updateOne({ id: 'thames-water' }, { $set: { lastReconciledAt: 'owned-by-payments' } });

    const outcome = outcomeFor(await harness.seed.run(), BILLERS_COLLECTION);

    expect(outcome.updated).toBe(0);
    await expect(
      field(BILLERS_COLLECTION, { id: 'thames-water' }, 'lastReconciledAt'),
    ).resolves.toBe('owned-by-payments');
  });

  it('restores a field the seed owns that was deleted outright', async () => {
    await harness.connection
      .collection(ROLES_COLLECTION)
      .updateOne({ role: 'AUDITOR' }, { $unset: { permissions: '' } });

    const outcome = outcomeFor(await harness.seed.run(), ROLES_COLLECTION);

    expect(outcome.updated).toBe(1);
    await expect(field(ROLES_COLLECTION, { role: 'AUDITOR' }, 'permissions')).resolves.toEqual([
      ...ROLE_DEFINITIONS.find((definition) => definition.role === 'AUDITOR')!.permissions,
    ]);
  });

  // --- Helpers -------------------------------------------------------------

  async function count(collection: string): Promise<number> {
    return harness.connection.collection(collection).countDocuments({});
  }

  async function field(
    collection: string,
    filter: Record<string, unknown>,
    name: string,
  ): Promise<unknown> {
    const document = await harness.connection.collection(collection).findOne(filter);
    return document?.[name];
  }

  async function productIds(): Promise<string[]> {
    const documents = await harness.connection
      .collection(PRODUCTS_COLLECTION)
      .find({}, { projection: { id: 1 }, sort: { id: 1 } })
      .toArray();
    return documents.map((document) => String(document['id']));
  }

  /** Every document of one collection, or of all of them, in a stable order. */
  async function snapshot(only?: string): Promise<Record<string, unknown>[]> {
    const collections = only ? [only] : SEEDED_COLLECTIONS;
    const documents: Record<string, unknown>[] = [];

    for (const collection of collections) {
      const found = await harness.connection
        .collection(collection)
        .find({})
        .sort({ _id: 1 })
        .toArray();
      documents.push(...found.map((document) => ({ ...document, __collection: collection })));
    }

    return documents;
  }
});

function outcomeFor(report: SeedReport, collection: string) {
  const outcome = report.outcomes.find((candidate) => candidate.collection === collection);
  if (!outcome) throw new Error(`The report has no outcome for ${collection}`);
  return outcome;
}
