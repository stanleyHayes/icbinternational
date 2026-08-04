import mongoose, { type Connection } from 'mongoose';

import { type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { type AppConfigService } from '../../config/config.service.js';
import { PRODUCTS_COLLECTION } from '../../modules/products/product.constants.js';
import { ProductRepository } from '../../modules/products/product.repository.js';
import { ProductSchema, ProductSchemaClass } from '../../modules/products/product.schema.js';
import { ProductService } from '../../modules/products/product.service.js';
import { AdminRolesSeeder } from '../foundation/admin-roles.seed.js';
import { BillersSeeder } from '../foundation/billers.seed.js';
import { CurrenciesSeeder } from '../foundation/currencies.seed.js';
import { LocationsSeeder } from '../foundation/locations.seed.js';
import { ProductsSeeder } from '../foundation/products.seed.js';
import { SeedWriter } from '../seed-writer.js';
import {
  BILLERS_COLLECTION,
  CURRENCIES_COLLECTION,
  LOCATIONS_COLLECTION,
  ROLES_COLLECTION,
} from '../seed.constants.js';
import { SeedService } from '../seed.service.js';

/**
 * A real database and the real seeders, wired by hand.
 *
 * Two deliberate departures from booting `SeedModule` through `Test.createTestingModule`.
 *
 * **No `replicaSet=` in the URI.** The dev replica set advertises itself as
 * `localhost:27017` while the container publishes `27317`, so once the driver builds a
 * replica-set topology it spends the full server-selection timeout per operation — five
 * upserts measured at 77 seconds against 292 milliseconds over the same connection without
 * it. The seed opens no transactions, so a single-server topology is not merely a
 * workaround here, it is sufficient. See the handoff in `docs/HANDOFFS.md`.
 *
 * **No configuration schema.** The seeders take exactly two collaborators between them —
 * a connection and a clock — and requiring eight unrelated secrets to be present just to
 * assert that a second seed run inserts nothing would make the test fragile for no gain.
 *
 * What is *not* faked: the connection, the collections, the Mongoose model, the
 * repository, the services, and every seeder. The only fake is the currency configuration,
 * which exists so the assertion about `enabled` has a fixed answer.
 */
export interface SeedHarness {
  readonly connection: Connection;
  readonly seed: SeedService;
  /** Every collection the foundation seed owns. */
  readonly collections: readonly string[];
  close(): Promise<void>;
  /** Empties the seeded collections without dropping the database. */
  reset(): Promise<void>;
}

/** Currencies the harness pretends the deployment trades. */
export const HARNESS_CURRENCIES: readonly CurrencyCode[] = ['GBP', 'USD', 'EUR'];
export const HARNESS_BASE_CURRENCY: CurrencyCode = 'GBP';

const DEFAULT_URI = 'mongodb://127.0.0.1:27317/?directConnection=true';
const DEFAULT_DATABASE = 'reliancebank_seed_test';
const SERVER_SELECTION_TIMEOUT_MS = 8000;

export const SEEDED_COLLECTIONS: readonly string[] = [
  CURRENCIES_COLLECTION,
  PRODUCTS_COLLECTION,
  BILLERS_COLLECTION,
  LOCATIONS_COLLECTION,
  ROLES_COLLECTION,
];

export async function buildSeedHarness(): Promise<SeedHarness> {
  const connection = await mongoose
    .createConnection(process.env['SEED_TEST_MONGODB_URI'] ?? DEFAULT_URI, {
      dbName: process.env['SEED_TEST_MONGODB_DB'] ?? DEFAULT_DATABASE,
      writeConcern: { w: 'majority', journal: true },
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    })
    .asPromise();

  const clock = new ClockService();
  const writer = new SeedWriter(connection, clock);

  const productModel = connection.model(ProductSchemaClass.name, ProductSchema);
  const products = new ProductService(
    new ProductRepository(productModel),
    clock,
    new IdGenerator(),
  );

  const seed = new SeedService([
    new CurrenciesSeeder(writer, fakeConfig()),
    new ProductsSeeder(products),
    new BillersSeeder(writer),
    new LocationsSeeder(writer),
    new AdminRolesSeeder(writer),
  ]);

  const harness: SeedHarness = {
    connection,
    seed,
    collections: SEEDED_COLLECTIONS,
    close: async () => {
      await connection.close();
    },
    reset: async () => {
      for (const name of SEEDED_COLLECTIONS) {
        await connection.collection(name).deleteMany({});
      }
    },
  };

  await harness.reset();
  return harness;
}

/** Only the two getters `CurrenciesSeeder` reads. */
function fakeConfig(): AppConfigService {
  return {
    bank: { currencies: HARNESS_CURRENCIES, baseCurrency: HARNESS_BASE_CURRENCY },
  } as unknown as AppConfigService;
}
