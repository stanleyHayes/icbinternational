import { randomUUID } from 'node:crypto';

import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection, type Model } from 'mongoose';

import { ErrorCode, FeeKind, type LimitMatrix, type Product } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { ClockService } from '../../../common/clock/clock.service.js';
import { EVERYDAY_CURRENT } from '../../../seed/foundation/catalogue/everyday-current.product.js';
import { FeeWaiver } from '../fee-calculator.js';
import { FeeService } from '../fee.service.js';
import { LimitRule, LimitScope } from '../limit-calculator.js';
import { LimitsService } from '../limits.service.js';
import { PRODUCTS_COLLECTION } from '../product.constants.js';
import { ProductSchemaClass } from '../product.schema.js';
import { ProductService, type ProductVersionDraft } from '../product.service.js';
import { ProductsModule } from '../products.module.js';
import { UsageCounterSchemaClass } from '../usage-counter.schema.js';

/**
 * The catalogue against a real replica set.
 *
 * The service unit tests run against an in-memory repository that reimplements the
 * version-resolution query; this suite is what proves the Mongo query, the unique
 * `{code, version}` index and the counter pipeline agree with it.
 */

process.env.NODE_ENV = 'test';
// `127.0.0.1` rather than `localhost`: the dev replica set advertises itself as
// `localhost:27017`, and on a machine that resolves `localhost` to `::1` first the driver
// spends the whole server-selection budget on an address nothing is listening on.
const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27317/?replicaSet=rs0';

jest.setTimeout(60_000);

const DB_NAME = 'reliancebank_products_test';
const NOW = new Date('2026-08-02T09:00:00.000Z');
const DUPLICATE_KEY = 11_000;

describe('the products module, against a replica set', () => {
  let moduleRef: TestingModule;
  let connection: Connection;
  let products: ProductService;
  let fees: FeeService;
  let limits: LimitsService;
  /** A code unique to this run, so a re-run never collides with the last one. */
  let code: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(MONGO_URI, { dbName: DB_NAME }),
        ClockModule,
        ProductsModule,
      ],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    products = moduleRef.get(ProductService);
    fees = moduleRef.get(FeeService);
    limits = moduleRef.get(LimitsService);
    moduleRef.get(ClockService).freezeAt(NOW);

    await connection.dropDatabase();

    await initIndexes(moduleRef);
  });

  beforeEach(() => {
    code = `IT_${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves the version in force by effective date, not by recency of publication', async () => {
    await products.publishVersion(draft({ effectiveFrom: '2026-01-01', monthlyFee: gbp('0') }));
    await products.publishVersion(draft({ effectiveFrom: '2026-09-01', monthlyFee: gbp('500') }));

    await expect(products.findActive(code, '2026-08-15')).resolves.toMatchObject({ version: 1 });
    await expect(products.findActive(code, '2026-09-01')).resolves.toMatchObject({ version: 2 });
    // The simulated clock sits at 2026-08-02, before v2 takes effect.
    await expect(products.findActive(code)).resolves.toMatchObject({ version: 1 });
  });

  it('does not alter an existing version when a newer one is published', async () => {
    // The task's acceptance criterion, asserted at the storage layer: after v2 and v3 are
    // published, the v1 document must be byte-identical — including its `updatedAt`, which
    // is what catches a repository that "helpfully" touches the predecessor.
    const published = await products.publishVersion(
      draft({ effectiveFrom: '2026-01-01', monthlyFee: gbp('0') }),
    );
    const before = await rawVersion(published.version);

    await products.publishVersion(draft({ effectiveFrom: '2026-06-01', monthlyFee: gbp('500') }));
    await products.publishVersion(draft({ effectiveFrom: '2026-09-01', monthlyFee: gbp('700') }));

    expect(await rawVersion(published.version)).toStrictEqual(before);

    const pinned = await products.getVersion(code, published.version);
    expect(pinned.monthlyFee.amount).toBe('0');
  });

  it('refuses a duplicate version of the same code at the database level', async () => {
    // A double-clicked publish or a retried seed must fail on the unique index, not write
    // a second v1 that resolution could pick over the first.
    const published = await products.publishVersion(draft({ effectiveFrom: '2026-01-01' }));
    const stored = await rawVersion(published.version);

    await expect(
      connection.collection(PRODUCTS_COLLECTION).insertOne(stored),
    ).rejects.toMatchObject({ code: DUPLICATE_KEY });

    await expect(products.ensureVersion({ ...published })).resolves.toBe(false);
  });

  it('counts a fee’s free allowance per calendar month', async () => {
    // ATM_INTERNATIONAL on the seeded product: two free withdrawals a month, then £1.50
    // plus 2% with a £1.50 floor and a £6.00 cap. A £100 withdrawal prices at £3.50.
    const published = await products.publishVersion(draft({ effectiveFrom: '2026-01-01' }));
    const request = {
      accountId: `it_fees_${code}`,
      product: published,
      kind: FeeKind.ATM_INTERNATIONAL,
      amount: Money.fromMinor('10000', 'GBP'),
    };

    const first = await fees.charge(request);
    const second = await fees.charge(request);
    const third = await fees.quote(request);

    expect(first.waivedBy).toBe(FeeWaiver.FREE_ALLOWANCE);
    expect(second.waivedBy).toBe(FeeWaiver.FREE_ALLOWANCE);
    expect(third.waivedBy).toBeNull();
    expect(third.fee.amount).toBe(350n);
  });

  it('consumes a limit window and reports the remaining allowance on breach', async () => {
    const matrix: LimitMatrix = {
      perTransaction: null,
      daily: gbp('100000'),
      monthly: null,
      dailyCount: 2,
    };
    const query = {
      accountId: `it_limits_${code}`,
      scope: LimitScope.ATM_WITHDRAWAL,
      matrix,
      currency: 'GBP' as const,
    };

    await limits.record(query, Money.fromMinor('60000', 'GBP'));
    await limits.record(query, Money.fromMinor('10000', 'GBP'));

    const breach = await limits
      .check(query, Money.fromMinor('50000', 'GBP'))
      .catch((error: unknown) => error);

    expect(breach).toMatchObject({
      code: ErrorCode.LIMIT_EXCEEDED,
      context: expect.objectContaining({
        rule: LimitRule.DAILY_COUNT,
        countLimit: 2,
        countUsed: 2,
      }),
    });

    const [day] = await limits.evaluate(query);
    expect(day?.used.amount).toBe(70_000n);
    expect(day?.remaining?.amount).toBe(30_000n);
  });

  /** A publishable draft of the seeded current account, re-coded to this run's product. */
  function draft(overrides: Partial<Product>): ProductVersionDraft {
    const full: Partial<Product> = { ...EVERYDAY_CURRENT, code, ...overrides };
    // The version number is assigned by the service; a draft must not carry one.
    delete full.version;
    return full as ProductVersionDraft;
  }

  /** The stored document for one version, exactly as Mongo holds it. */
  async function rawVersion(version: number): Promise<Record<string, unknown>> {
    const document = await connection
      .collection(PRODUCTS_COLLECTION)
      .findOne({ code, version }, { projection: { _id: 0 } });
    if (!document) throw new RangeError(`No stored version ${version} of ${code}`);
    return document as Record<string, unknown>;
  }
});

function gbp(minorUnits: string) {
  return { amount: minorUnits, currency: 'GBP' } as const;
}

/**
 * Waits for the models' indexes to be built.
 *
 * Index creation is asynchronous after connection, and the duplicate-version test is
 * only meaningful once the unique `{code, version}` index actually exists.
 */
async function initIndexes(moduleRef: TestingModule): Promise<void> {
  const models = [
    getModelToken(ProductSchemaClass.name),
    getModelToken(UsageCounterSchemaClass.name),
  ];

  for (const token of models) {
    await moduleRef.get<Model<unknown>>(token).init();
  }
}
