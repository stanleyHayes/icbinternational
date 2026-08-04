/**
 * Isolated-database Mongo harness for integration tests.
 *
 * One `MongoTestHarness` per test suite: it connects to the replica set from
 * `MONGODB_URI` (the single-node `rs0` that `pnpm db:up` starts) and hands the suite
 * its own database — created empty, dropped on `stop()`. Isolation is at database
 * level, so suites run in parallel against one server without seeing each other, and
 * multi-document transactions work exactly as they do in production.
 *
 * Why not an in-memory server? `mongodb-memory-server` downloads a mongod binary per
 * developer and CI runner, and its first start takes far longer than the three-second
 * budget the plan sets. A database-per-suite on the local replica set spins up in
 * well under a second and exercises the real transaction path.
 */

import mongoose, { type Connection } from 'mongoose';
import { ulid } from 'ulid';

/** Falls back to the documented local replica set from `.env.example`. */
const DEFAULT_MONGODB_URI =
  'mongodb://localhost:27317/reliancebank?replicaSet=rs0&directConnection=true';

/**
 * Selection timeout is generous on purpose: the development replica set is shared,
 * and a busy machine should slow a suite down, not fail it. The <3s acceptance
 * budget is asserted separately, as a best-of-several spin-up measurement.
 */
const SERVER_SELECTION_TIMEOUT_MS = 10_000;

/** Options accepted by {@link MongoTestHarness.start}. */
export interface MongoHarnessOptions {
  /** Replica-set URI. Defaults to `process.env.MONGODB_URI`, then the local `rs0`. */
  readonly uri?: string;
  /** Database name. Defaults to a unique `rb_test_<ulid>` per harness. */
  readonly dbName?: string;
}

/** An isolated, disposable MongoDB database plus the connection that owns it. */
export class MongoTestHarness {
  private constructor(
    /** The mongoose connection bound to this harness's database. */
    readonly connection: Connection,
    /** The unique database this harness owns. */
    readonly dbName: string,
    /** The base replica-set URI this harness connected through. */
    private readonly baseUri: string,
  ) {}

  /**
   * Connects and returns a ready harness. Resolves once the driver has found the
   * replica-set primary, so writes made immediately afterwards are majority-safe.
   */
  static async start(options: MongoHarnessOptions = {}): Promise<MongoTestHarness> {
    const baseUri = options.uri ?? process.env.MONGODB_URI ?? DEFAULT_MONGODB_URI;
    const dbName = options.dbName ?? `rb_test_${ulid().toLowerCase()}`;

    const connection = await mongoose
      .createConnection(baseUri, {
        dbName,
        serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      })
      .asPromise();

    return new MongoTestHarness(connection, dbName, baseUri);
  }

  /** A connection string pointing at this harness's database. */
  get uri(): string {
    return this.baseUri.replace(/^(mongodb(?:\+srv)?:\/\/[^/]+)\/?[^?]*/, `$1/${this.dbName}`);
  }

  /** Empties every collection in the harness database, keeping indexes. */
  async reset(): Promise<void> {
    const db = this.connection.db;
    if (!db) throw new HarnessStateError('reset() called before the connection was ready');

    const collections = await db.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  }

  /** Drops the database and closes the connection. Always call this in teardown. */
  async stop(): Promise<void> {
    const db = this.connection.db;
    if (db) await db.dropDatabase();
    await this.connection.close();
  }
}

/** Raised when the harness is used outside its connected lifecycle. */
export class HarnessStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HarnessStateError';
  }
}
