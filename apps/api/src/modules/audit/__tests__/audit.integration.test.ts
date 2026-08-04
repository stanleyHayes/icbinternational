import mongoose, { type Connection, type Model } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { AuditEventRepository } from '../audit-event.repository.js';
import { AuditEventDocument, AuditEventSchema } from '../audit-event.schema.js';
import { AuditVerifierService } from '../audit-verifier.service.js';
import { AUDIT_EVENT_COLLECTION } from '../audit.constants.js';
import { AuditService, type RecordAuditInput } from '../audit.service.js';
import { AuditActorType } from '../audit.types.js';

/**
 * End-to-end proof of the A-07 acceptance criterion.
 *
 * The unit tests prove the algorithm; this proves it against the thing that actually
 * stores the data. Specifically: that the append-only guard survives a real Mongoose
 * model, that the unique index — not a lock — is what serialises concurrent appends, and
 * that editing a row **directly in MongoDB**, the way a tamperer with database access
 * would, is detected at exactly that row.
 *
 * Needs the local replica set (`pnpm db:up`). When it is not reachable the suite reports
 * a visible skip rather than failing: a developer without the container running should
 * not see a red build for a test that never executed, and CI runs it with the container.
 */

// Generous because this suite shares one single-node replica set with every other
// module's integration tests; a slow write under load is not a broken test.
jest.setTimeout(120_000);

const DEFAULT_URI = 'mongodb://127.0.0.1:27317/reliancebank?replicaSet=rs0';

/**
 * `localhost` is rewritten to the IPv4 literal.
 *
 * Jest's node environment resolves `localhost` to `::1` first and the container publishes
 * on IPv4 only, so the driver spends its whole server-selection window talking to nothing
 * and the suite fails with a timeout that reads like a broken test rather than a broken
 * hostname. This cost an hour once; it will not cost another.
 */
const URI = (process.env.MONGODB_URI ?? DEFAULT_URI).replace('//localhost:', '//127.0.0.1:');

const DB_NAME = 'reliancebank_audit_itest';

/** Short, so an absent database reports in seconds instead of hitting the hook timeout. */
const SERVER_SELECTION_TIMEOUT_MS = 5000;

/** Our own ceiling on the whole connect, in case the driver's own never fires. */
const CONNECT_DEADLINE_MS = 8000;

function recordInput(entityId: string): RecordAuditInput {
  return {
    actor: { type: AuditActorType.ADMIN, id: 'adm_itest', name: 'Integration Tester' },
    action: 'account.freeze',
    entity: 'account',
    entityId,
    before: { status: 'ACTIVE' },
    after: { status: 'FROZEN' },
    ipAddress: '127.0.0.1',
    traceId: 'itest',
  };
}

describe('audit trail (integration)', () => {
  let connection: Connection | null = null;
  let model: Model<AuditEventDocument>;
  let service: AuditService;
  let verifier: AuditVerifierService;
  let unavailable: string | null = null;

  beforeAll(async () => {
    const pending = mongoose.createConnection(URI, {
      dbName: DB_NAME,
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    });

    try {
      // Raced against our own deadline as well as the driver's. A container that accepts
      // the TCP connection but never answers leaves `asPromise()` pending indefinitely,
      // and a hung hook reports as five mystery failures instead of one clear skip.
      connection = await Promise.race([pending.asPromise(), rejectAfter(CONNECT_DEADLINE_MS)]);
    } catch (error) {
      await pending.close().catch(() => undefined);
      unavailable = `${URI} is unreachable — run \`pnpm db:up\` (${describeError(error)})`;
      console.warn(`[audit integration] SKIPPING: ${unavailable}`);
      return;
    }

    model = connection.model(AuditEventDocument.name, AuditEventSchema);
    await model.createIndexes();

    const repository = new AuditEventRepository(model);
    service = new AuditService(repository, new ClockService(), new IdGenerator());
    verifier = new AuditVerifierService(repository, new ClockService());
  });

  beforeEach(async () => {
    // Raw driver, bypassing the append-only guard — legitimate only for test isolation.
    await connection?.db?.collection(AUDIT_EVENT_COLLECTION).deleteMany({});
  });

  afterAll(async () => {
    if (!connection) return;
    await connection.db?.dropDatabase();
    await connection.close();
  });

  /** Runs the body only when the replica set is up, and says so loudly when it is not. */
  function withDatabase(name: string, body: () => Promise<void>): void {
    // Every body below asserts; the rule cannot see through this one level of indirection.
    // eslint-disable-next-line sonarjs/assertions-in-tests
    it(name, async () => {
      if (unavailable) {
        console.warn(`[audit integration] skipped "${name}": ${unavailable}`);
        return;
      }
      await body();
    });
  }

  withDatabase('refuses updates and deletes issued through the model', async () => {
    await service.record(recordInput('acc_guard'));

    await expect(model.updateOne({}, { $set: { actorName: 'Mallory' } })).rejects.toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
    });
    await expect(model.findOneAndUpdate({}, { $set: { actorName: 'Mallory' } })).rejects.toThrow();
    await expect(model.deleteMany({})).rejects.toThrow();

    const report = await verifier.verify();
    expect(report.verified).toBe(true);
  });

  withDatabase('verifies a chain of events written through the service', async () => {
    await service.record(recordInput('acc_1'));
    await service.record(recordInput('acc_2'));
    await service.record(recordInput('acc_3'));

    const report = await verifier.verify();

    expect(report).toMatchObject({
      verified: true,
      eventsChecked: 3,
      firstBrokenSequence: null,
      reason: null,
    });
  });

  withDatabase('ACCEPTANCE: mutating one historical record makes verification fail', async () => {
    await service.record(recordInput('acc_1'));
    await service.record(recordInput('acc_2'));
    await service.record(recordInput('acc_3'));

    // The tamperer edits history straight in MongoDB — no application code involved.
    await connection?.db
      ?.collection(AUDIT_EVENT_COLLECTION)
      .updateOne({ sequence: 2 }, { $set: { actorName: 'Mallory' } });

    const report = await verifier.verify();

    expect(report.verified).toBe(false);
    expect(report.firstBrokenSequence).toBe(2);
  });

  withDatabase('detects a record deleted straight from the collection', async () => {
    await service.record(recordInput('acc_1'));
    await service.record(recordInput('acc_2'));
    await connection?.db?.collection(AUDIT_EVENT_COLLECTION).deleteOne({ sequence: 1 });

    const report = await verifier.verify();

    expect(report.verified).toBe(false);
    expect(report.firstBrokenSequence).toBe(2);
  });

  withDatabase('serialises concurrent appends onto a single unbroken chain', async () => {
    const writers = ['acc_a', 'acc_b', 'acc_c', 'acc_d'].map((entityId) =>
      service.record(recordInput(entityId)),
    );

    const events = await Promise.all(writers);
    const sequences = events.map((event) => event.sequence);

    // Every writer got a distinct position: the unique index adjudicated the race.
    expect(new Set(sequences).size).toBe(writers.length);

    const report = await verifier.verify();
    expect(report.verified).toBe(true);
    expect(report.eventsChecked).toBe(writers.length);
  });
});

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Rejects after `ms`. The timer is unref'd so it can never hold the process open. */
function rejectAfter(ms: number): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error(`no response within ${ms}ms`));
    }, ms).unref();
  });
}
