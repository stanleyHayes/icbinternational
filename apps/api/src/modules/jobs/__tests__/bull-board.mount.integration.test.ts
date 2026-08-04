import {
  Module,
  type NestMiddleware,
  type NestModule,
  type MiddlewareConsumer,
  type INestApplication,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

import { API_PREFIX, Permission } from '@reliance/contracts';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { JobsModule } from '../jobs.module.js';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://localhost:27317/?replicaSet=rs0';
process.env.MONGODB_DB = 'reliancebank_jobs_mount_test';
process.env.REDIS_URL ??= 'redis://localhost:6579';
process.env.JWT_ACCESS_SECRET = 'integration-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'integration-test-refresh-secret-0123456789';
process.env.CSRF_SECRET = 'integration-test-csrf';
process.env.ENCRYPTION_KEY = 'integration-test-encryption-key-012345';

jest.setTimeout(240_000);

const BOARD_PATH = `${API_PREFIX}/admin/queues`;

interface StubbedRequest extends Request {
  adminPermissions?: readonly string[];
}

/** Stands in for the admin auth layer (A-06): grants `job:manage` to every caller. */
class AdminAuthStub implements NestMiddleware {
  use(request: StubbedRequest, _response: Response, next: NextFunction): void {
    Object.assign(request, { adminPermissions: [Permission.JOB_MANAGE] });
    next();
  }
}

/**
 * Own module, imported before JobsModule: Nest runs non-global modules' middleware in
 * import order, so the stub must sit left of JobsModule in the imports array — the
 * same constraint the real admin-auth module (A-06) will have in AppModule.
 */
@Module({})
class AdminAuthStubModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AdminAuthStub).forRoutes('*path');
  }
}

@Module({ imports: [AppConfigModule, ClockModule, AdminAuthStubModule, JobsModule] })
class MountTestModule {}

describe('JobsModule Bull Board mount (integration, real Nest app)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [MountTestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX.slice(1));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the board under the global API prefix', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get(`${BOARD_PATH}/`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('does not answer outside the prefixed mount path', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/admin/queues/');

    expect(response.status).toBe(404);
  });
});
