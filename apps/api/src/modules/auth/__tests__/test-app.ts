import { type INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { type Connection } from 'mongoose';
import request from 'supertest';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { ClockService } from '../../../common/clock/clock.service.js';
import { AppExceptionFilter } from '../../../common/errors/exception.filter.js';
import { ResponseEnvelopeInterceptor } from '../../../common/interceptors/response.interceptor.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { AuthModule } from '../auth.module.js';
import { AUTH_EMAIL_PORT, type AuthEmail, type AuthEmailPort } from '../ports/auth-email.port.js';

import { applyTestEnvironment } from './test-environment.js';

/** Captures the emails the logging adapter would print, so tests can redeem the tokens. */
export class FakeAuthEmail implements AuthEmailPort {
  readonly sent: { kind: 'verification' | 'reset'; to: string; token: string }[] = [];

  async sendVerificationEmail(message: AuthEmail): Promise<void> {
    this.sent.push({ kind: 'verification', to: message.to, token: message.token });
  }

  async sendPasswordResetEmail(message: AuthEmail): Promise<void> {
    this.sent.push({ kind: 'reset', to: message.to, token: message.token });
  }

  /** The most recent token of a kind sent to an address. Throws rather than returning ''. */
  lastToken(kind: 'verification' | 'reset', to: string): string {
    const mail = [...this.sent].reverse().find((entry) => entry.kind === kind && entry.to === to);
    if (!mail) throw new Error(`No ${kind} email was sent to ${to}`);
    return mail.token;
  }
}

/** A booted Nest app wired like `main.ts`, minus the network listener. */
export interface TestApp {
  app: INestApplication;
  email: FakeAuthEmail;
  close(): Promise<void>;
}

/**
 * Generous selection/connect timeouts: the shared development Mongo runs in a VM that
 * concurrent agents can starve, and the default 30s selection window is not always enough.
 */
const MONGO_TIMEOUTS = { serverSelectionTimeoutMS: 120_000, connectTimeoutMS: 60_000 };

/**
 * Boots the auth module against the real replica set with a fake email port.
 *
 * The global filter and interceptor are registered exactly as `AppModule` registers them,
 * so the envelopes these tests assert are the ones production renders.
 */
export async function startTestApp(dbName: string): Promise<TestApp> {
  const { uri } = applyTestEnvironment(dbName);
  const email = new FakeAuthEmail();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      AppConfigModule,
      ClockModule,
      MongooseModule.forRoot(uri, { dbName, ...MONGO_TIMEOUTS }),
      AuthModule,
    ],
  })
    .overrideProvider(AUTH_EMAIL_PORT)
    .useValue(email)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1');
  app.use(cookieParser(process.env['CSRF_SECRET'] ?? ''));
  app.useGlobalFilters(new AppExceptionFilter(moduleRef.get(ClockService)));
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  await app.init();

  // Start from an empty database — a killed previous run may have left one behind —
  // then wait for the unique indexes. autoIndex builds in the background, and a
  // duplicate-email assertion that runs before the build finishes would pass a write
  // it should reject.
  const connection = moduleRef.get<Connection>(getConnectionToken());
  await connection.dropDatabase();
  await Promise.all(Object.values(connection.models).map((model) => model.ensureIndexes()));

  const close = async (): Promise<void> => {
    await moduleRef.get<Connection>(getConnectionToken()).dropDatabase();

    // supertest leaves keep-alive sockets idle, and `server.close()` waits for them to
    // drain on their own — minutes, under a loaded machine. Sever them first.
    const server: unknown = app.getHttpServer();
    (server as { closeAllConnections?: () => void }).closeAllConnections?.();
    await app.close();
  };

  return { app, email, close };
}

/** A supertest agent bound to the app, with the `any` of `getHttpServer` narrowed away. */
export function http(app: INestApplication): ReturnType<typeof request> {
  const server: unknown = app.getHttpServer();
  return request(server as Parameters<typeof request>[0]);
}

/** The `Set-Cookie` pairs of a response as a name → value map. */
export function jarOf(response: request.Response): Map<string, string> {
  const jar = new Map<string, string>();
  const lines = response.headers['set-cookie'];
  for (const line of Array.isArray(lines) ? lines : []) {
    const [pair] = line.split(';');
    const separator = pair?.indexOf('=') ?? -1;
    if (pair && separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return jar;
}

/** Formats a cookie jar for the `Cookie` request header. */
export function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}
