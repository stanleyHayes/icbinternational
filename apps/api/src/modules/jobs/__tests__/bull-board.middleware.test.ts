import { Queue } from 'bullmq';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

import { ErrorCode, Permission } from '@reliance/contracts';

import { createBullBoardHandlers } from '../bull-board.middleware.js';
import { JOB_QUEUE, deadLetterQueueName } from '../jobs.constants.js';

const BASE_PATH = '/v1/admin/queues';
const REDIS_OPTIONS = { host: 'localhost', port: 6579, maxRetriesPerRequest: null };

interface TestRequest extends Request {
  adminPermissions?: readonly string[];
}

/** Builds an app with an admin-auth stub controlled by the `x-test-permissions` header. */
function buildApp(queues: Queue[]): Express {
  const app = express();
  app.use((req: TestRequest, _res: Response, next: NextFunction) => {
    const header = req.headers['x-test-permissions'];
    if (typeof header === 'string') Object.assign(req, { adminPermissions: header.split(',') });
    next();
  });
  app.use(BASE_PATH, ...createBullBoardHandlers({ queues, basePath: BASE_PATH }));
  return app;
}

describe('createBullBoardHandlers', () => {
  let queues: Queue[];
  let app: Express;

  beforeAll(() => {
    queues = [JOB_QUEUE.LEDGER, deadLetterQueueName(JOB_QUEUE.LEDGER)].map(
      (name) => new Queue(name, { connection: REDIS_OPTIONS }),
    );
    app = buildApp(queues);
  });

  afterAll(async () => {
    await Promise.all(queues.map(async (queue) => queue.close()));
  });

  it('fails closed with 401 when no admin identity is present', async () => {
    const response = await request(app).get(`${BASE_PATH}/`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: ErrorCode.UNAUTHENTICATED,
        message: 'This endpoint requires an authenticated administrator',
      },
    });
  });

  it('answers 403 when the admin lacks job:manage', async () => {
    const response = await request(app)
      .get(`${BASE_PATH}/`)
      .set('x-test-permissions', Permission.REPORT_READ);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ErrorCode.PERMISSION_DENIED);
  });

  it('serves the board UI to an admin holding job:manage', async () => {
    const response = await request(app)
      .get(`${BASE_PATH}/`)
      .set('x-test-permissions', Permission.JOB_MANAGE);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });
});
