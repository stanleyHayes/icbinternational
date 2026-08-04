/**
 * The rate limiter has to bound something the caller cannot choose.
 *
 * The guard used to key its window on `X-Forwarded-For`, on the assumption that a trusted
 * proxy had set it. Nothing configured a trusted proxy, so the header was simply whatever
 * the caller typed: rotating it produced a fresh budget on every request and the limiter
 * bounded nothing at all.
 *
 * These tests run over a real Nest/Express app and real sockets rather than a hand-built
 * request object, because the thing under test *is* Express's decision about whether the
 * header may be believed. A fake `request` would let the header back in unnoticed.
 */

import 'reflect-metadata';

import { Controller, Get, UseGuards } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppExceptionFilter } from '../../../common/errors/exception.filter.js';
import { loadEnvironment } from '../../../config/configuration.js';
import { PublicRateLimitGuard, RateLimit } from '../public-rate-limit.guard.js';

const LIMIT = 2;
const WINDOW_SECONDS = 60;
const OK = 200;
const TOO_MANY = 429;

/** Three addresses a caller could invent, none of them theirs. */
const SPOOFED = ['203.0.113.9', '198.51.100.4', '192.0.2.77'] as const;

@Controller('probe')
@UseGuards(PublicRateLimitGuard)
class ProbeController {
  @Get()
  @RateLimit({ limit: LIMIT, windowSeconds: WINDOW_SECONDS })
  read(): { ok: true } {
    return { ok: true };
  }
}

/** A fresh app — and so a fresh, empty window map — per scenario. */
async function buildApp(trustProxy: boolean | number | string): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController],
    providers: [ClockService, PublicRateLimitGuard],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', trustProxy);
  app.useGlobalFilters(new AppExceptionFilter(app.get(ClockService)));
  await app.init();

  return app;
}

function probe(app: NestExpressApplication, forwardedFor: string) {
  const server = app.getHttpServer() as Parameters<typeof request>[0];

  return request(server).get('/probe').set('X-Forwarded-For', forwardedFor);
}

describe('the public rate limiter cannot be reset by the caller', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    // Trusting nothing, which is the shipped default.
    app = await buildApp(false);
  });

  afterEach(async () => {
    await app.close();
  });

  it('spends one budget across requests carrying different X-Forwarded-For values', async () => {
    const first = await probe(app, SPOOFED[0]);
    const second = await probe(app, SPOOFED[1]);
    const third = await probe(app, SPOOFED[2]);

    expect(first.status).toBe(OK);
    expect(second.status).toBe(OK);
    expect(third.status).toBe(TOO_MANY);
  });

  it('counts a rotating header down the same window rather than restarting it', async () => {
    const first = await probe(app, SPOOFED[0]);
    const second = await probe(app, SPOOFED[1]);

    expect(first.headers['ratelimit-remaining']).toBe('1');
    expect(second.headers['ratelimit-remaining']).toBe('0');
  });

  it('answers the rejected request with RATE_LIMITED and a Retry-After', async () => {
    await probe(app, SPOOFED[0]);
    await probe(app, SPOOFED[1]);
    const rejected = await probe(app, SPOOFED[2]);

    expect(rejected.status).toBe(TOO_MANY);
    expect(rejected.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(Number(rejected.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('still bounds a caller that sends no header at all', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server).get('/probe');
    await request(server).get('/probe');
    const third = await request(server).get('/probe');

    expect(third.status).toBe(TOO_MANY);
  });
});

describe('behind a proxy the operator has opted into', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await buildApp(true);
  });

  afterEach(async () => {
    await app.close();
  });

  /**
   * The other half of the fix: once `trust proxy` is on, the forwarded address is the
   * caller and each one gets its own budget. Without this the fix would have swapped a
   * useless limiter for one that throttles a whole CDN as a single client.
   */
  it('gives each forwarded address its own budget', async () => {
    const first = await probe(app, SPOOFED[0]);
    const second = await probe(app, SPOOFED[1]);
    const third = await probe(app, SPOOFED[2]);

    expect([first.status, second.status, third.status]).toEqual([OK, OK, OK]);
  });

  it('still bounds one forwarded address', async () => {
    await probe(app, SPOOFED[0]);
    await probe(app, SPOOFED[0]);
    const third = await probe(app, SPOOFED[0]);

    expect(third.status).toBe(TOO_MANY);
  });
});

/** Enough of a valid environment to parse; only `TRUST_PROXY` is under test. */
function environmentWith(trustProxy?: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://localhost:27017/?replicaSet=rs0',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CSRF_SECRET: 'c'.repeat(16),
    ENCRYPTION_KEY: 'd'.repeat(32),
    ...(trustProxy === undefined ? {} : { TRUST_PROXY: trustProxy }),
  };
}

describe('TRUST_PROXY', () => {
  it('trusts nothing when unset, so an unconfigured deployment is the safe one', () => {
    expect(loadEnvironment(environmentWith()).TRUST_PROXY).toBe(false);
  });

  it.each([
    ['false', false],
    ['', false],
    ['true', true],
    ['1', 1],
    ['2', 2],
    ['loopback', 'loopback'],
    ['10.0.0.0/8, 127.0.0.1', '10.0.0.0/8, 127.0.0.1'],
  ])('reads %p as %p', (raw, expected) => {
    expect(loadEnvironment(environmentWith(raw)).TRUST_PROXY).toBe(expected);
  });
});
