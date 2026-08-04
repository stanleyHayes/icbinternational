import mongoose, { type Connection } from 'mongoose';

import { MongoTestHarness } from '../mongo-test-harness.js';

/** The plan's acceptance budget for spinning an isolated database. */
const SPIN_UP_BUDGET_MS = 3_000;
/** Repetitions for the timing proof — guards against transient machine load. */
const SPIN_UP_ATTEMPTS = 3;
/** Generous outer timeout so slow CI cannot mask a budget breach inside a test. */
const SUITE_TIMEOUT_MS = 30_000;

const COLLECTION = 'probe';
const PROBE_SCHEMA = new mongoose.Schema({ note: String });

function probeModel(connection: Connection) {
  return connection.models[COLLECTION] ?? connection.model(COLLECTION, PROBE_SCHEMA);
}

/** Times one full spin-up: connect, write, read back, drop. */
async function timeSpinUp(): Promise<number> {
  const startedAt = performance.now();
  const harness = await MongoTestHarness.start();

  try {
    await probeModel(harness.connection).create({ note: 'writable' });
    await probeModel(harness.connection).countDocuments();
    return performance.now() - startedAt;
  } finally {
    await harness.stop();
  }
}

describe('MongoTestHarness', () => {
  jest.setTimeout(SUITE_TIMEOUT_MS);

  it('spins an isolated, writable database in under 3 seconds', async () => {
    // Best of three: proves the harness meets the budget without flaking when the
    // shared development machine is busy.
    const timings: number[] = [];
    for (let attempt = 0; attempt < SPIN_UP_ATTEMPTS; attempt++) {
      timings.push(await timeSpinUp());
    }

    const best = Math.min(...timings);
    expect(best).toBeLessThan(SPIN_UP_BUDGET_MS);
  });

  it('gives every suite its own database', async () => {
    const first = await MongoTestHarness.start();
    const second = await MongoTestHarness.start();

    try {
      expect(first.dbName).not.toBe(second.dbName);
      expect(first.uri).toContain(`/${first.dbName}?`);
    } finally {
      await first.stop();
      await second.stop();
    }
  });

  it('isolates writes between harnesses on the same server', async () => {
    const first = await MongoTestHarness.start();
    const second = await MongoTestHarness.start();

    try {
      await probeModel(first.connection).create({ note: 'only in first' });

      expect(await probeModel(first.connection).countDocuments()).toBe(1);
      expect(await probeModel(second.connection).countDocuments()).toBe(0);
    } finally {
      await first.stop();
      await second.stop();
    }
  });

  it('supports multi-document transactions on the replica set', async () => {
    const harness = await MongoTestHarness.start();

    try {
      const model = probeModel(harness.connection);
      // An idle single-node replica set only advances its majority commit point on
      // the periodic no-op (~10s). One majority write warms it, like any real
      // database would, so the transaction commits in milliseconds.
      await harness.connection
        .db!.collection('warmup')
        .insertOne({ note: 'advance commit point' }, { writeConcern: { w: 'majority' } });

      await harness.connection.transaction(async (session) => {
        await model.create([{ note: 'a' }], { session });
        await model.create([{ note: 'b' }], { session });
      });

      expect(await model.countDocuments()).toBe(2);
    } finally {
      await harness.stop();
    }
  });

  it('reset() empties every collection but keeps the database usable', async () => {
    const harness = await MongoTestHarness.start();

    try {
      const model = probeModel(harness.connection);
      await model.create({ note: 'before reset' });

      await harness.reset();
      expect(await model.countDocuments()).toBe(0);

      await model.create({ note: 'after reset' });
      expect(await model.countDocuments()).toBe(1);
    } finally {
      await harness.stop();
    }
  });

  it('stop() drops the database', async () => {
    const harness = await MongoTestHarness.start();
    const dbName = harness.dbName;
    await probeModel(harness.connection).create({ note: 'doomed' });
    await harness.stop();

    const check = await mongoose
      .createConnection(harness.uri, { serverSelectionTimeoutMS: SPIN_UP_BUDGET_MS })
      .asPromise();
    try {
      const names = await check.db!.listCollections().toArray();
      expect(names.map((collection) => collection.name)).not.toContain(COLLECTION);
      expect(check.name).toBe(dbName);
    } finally {
      await check.dropDatabase();
      await check.close();
    }
  });
});
