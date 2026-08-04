import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection } from 'mongoose';
import request from 'supertest';
import { type App } from 'supertest/types.js';

import { AccountType, ErrorCode, type Product } from '@reliance/contracts';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { ClockService } from '../../../common/clock/clock.service.js';
import { AppExceptionFilter } from '../../../common/errors/exception.filter.js';
import { ResponseEnvelopeInterceptor } from '../../../common/interceptors/response.interceptor.js';
import { EVERYDAY_CURRENT } from '../../../seed/foundation/catalogue/everyday-current.product.js';
import { AdminAuthGuard } from '../../rbac/admin-auth.guard.js';
import { IpAllowlistGuard } from '../../rbac/ip-allowlist.guard.js';
import { PermissionGuard } from '../../rbac/permission.guard.js';
import { type ProductRates } from '../products.controller.js';
import { ProductsModule } from '../products.module.js';

/**
 * The catalogue's HTTP surface, end to end.
 *
 * The service suites prove the behaviour; this suite proves the wiring around it — that
 * the routes match the contract's map, that the Zod pipe rejects a malformed draft with
 * field-level detail, and that every answer arrives in the contract's envelope.
 */

process.env.NODE_ENV = 'test';
// `127.0.0.1` rather than `localhost`: see the repository integration suite.
const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27317/?replicaSet=rs0';

jest.setTimeout(60_000);

const DB_NAME = 'reliancebank_products_api_test';
const NOW = new Date('2026-08-02T09:00:00.000Z');

describe('the products API, over HTTP', () => {
  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let code: string;

  beforeAll(async () => {
    // `@AdminEndpoint()` puts three guards on the publish route. This suite is about the
    // catalogue's HTTP surface, not about who may reach it — admin authentication, the IP
    // allowlist and permission checks each have their own tests in the rbac suite. Stubbing
    // them keeps a failure here meaning what the suite name says it means.
    const allow = { canActivate: (): boolean => true };

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(MONGO_URI, { dbName: DB_NAME }),
        ClockModule,
        ProductsModule,
      ],
    })
      .overrideGuard(AdminAuthGuard)
      .useValue(allow)
      .overrideGuard(IpAllowlistGuard)
      .useValue(allow)
      .overrideGuard(PermissionGuard)
      .useValue(allow)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new AppExceptionFilter(moduleRef.get(ClockService)));
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();

    moduleRef.get(ClockService).freezeAt(NOW);
    await moduleRef.get<Connection>(getConnectionToken()).dropDatabase();
  });

  beforeEach(() => {
    code = `IT_${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the public catalogue in the contract envelope', async () => {
    await publishDraft(draft({ effectiveFrom: '2026-01-01' }));

    const response = await request(app.getHttpServer()).get('/v1/public/products').expect(200);

    const body = response.body as { data: Product[] };
    const listed = body.data.find((product) => product.code === code);
    expect(listed).toMatchObject({ code, version: 1, monthlyFee: { amount: '0' } });
  });

  it('serves the public rate table, grouped by product', async () => {
    await publishDraft(draft({ effectiveFrom: '2026-01-01' }));

    const response = await request(app.getHttpServer()).get('/v1/public/rates').expect(200);

    const body = response.body as { data: ProductRates[] };
    const listed = body.data.find((rates) => rates.code === code);
    expect(listed).toMatchObject({
      code,
      accountType: AccountType.CURRENT,
      debitInterestBps: 3990,
    });
    expect(listed?.creditInterestTiers).toHaveLength(3);
  });

  it('resolves one product by code, and 404s in the contract shape for an unknown one', async () => {
    await publishDraft(draft({ effectiveFrom: '2026-01-01' }));

    const found = await request(app.getHttpServer()).get(`/v1/public/products/${code}`).expect(200);
    expect((found.body as { data: Product }).data.code).toBe(code);

    const missing = await request(app.getHttpServer())
      .get('/v1/public/products/NO_SUCH_PRODUCT')
      .expect(404);
    expect((missing.body as { error: { code: string } }).error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('honours the asOf query when resolving the catalogue', async () => {
    await publishDraft(draft({ effectiveFrom: '2026-01-01', monthlyFee: money('0') }));
    await publishDraft(draft({ effectiveFrom: '2026-09-01', monthlyFee: money('500') }));

    const response = await request(app.getHttpServer())
      .get(`/v1/public/products/${code}?asOf=2026-06-01`)
      .expect(200);

    expect((response.body as { data: Product }).data).toMatchObject({
      version: 1,
      monthlyFee: { amount: '0' },
    });
  });

  it('rejects a malformed publish draft with field-level detail', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/admin/products')
      .send({ code })
      .expect(400);

    const body = response.body as { error: { code: string; details: { path: string }[] } };
    expect(body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(body.error.details.length).toBeGreaterThan(1);
    expect(body.error.details.map((detail) => detail.path)).toContain('name');
  });

  it('publishes a version and lists the product’s history', async () => {
    await publishDraft(draft({ effectiveFrom: '2026-01-01' }));
    await publishDraft(draft({ effectiveFrom: '2026-09-01', monthlyFee: money('500') }));

    const history = await request(app.getHttpServer())
      .get(`/v1/admin/products/${code}`)
      .expect(200);

    const versions = (history.body as { data: Product[] }).data;
    expect(versions.map((product) => product.version)).toEqual([1, 2]);
    expect(versions[0]?.monthlyFee.amount).toBe('0');
  });

  /** POSTs a draft to the admin endpoint, expecting it to be accepted. */
  async function publishDraft(draft: Record<string, unknown>): Promise<void> {
    await request(app.getHttpServer()).post('/v1/admin/products').send(draft).expect(201);
  }

  /** A full publish draft of the seeded current account, re-coded to this test. */
  function draft(overrides: Partial<Product>): Record<string, unknown> {
    const full: Partial<Product> = { ...EVERYDAY_CURRENT, code, ...overrides };
    // The version number is assigned by the service; a draft must not carry one.
    delete full.version;
    return full;
  }
});

function money(minorUnits: string) {
  return { amount: minorUnits, currency: 'GBP' } as const;
}
