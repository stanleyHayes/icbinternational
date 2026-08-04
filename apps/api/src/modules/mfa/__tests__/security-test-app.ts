import { type INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { type Connection } from 'mongoose';

import { COOKIE, CSRF_HEADER } from '@reliance/contracts';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { ClockService } from '../../../common/clock/clock.service.js';
import { AppExceptionFilter } from '../../../common/errors/exception.filter.js';
import { ResponseEnvelopeInterceptor } from '../../../common/interceptors/response.interceptor.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { FakeAuthEmail, cookieHeader, http, jarOf } from '../../auth/__tests__/test-app.js';
import {
  applyTestEnvironment,
  loginOf,
  registrationOf,
} from '../../auth/__tests__/test-environment.js';
import { AuthModule } from '../../auth/auth.module.js';
import { AUTH_EMAIL_PORT } from '../../auth/ports/auth-email.port.js';
import { DevicesModule } from '../../devices/devices.module.js';
import { MfaModule } from '../mfa.module.js';

/** A booted Nest app with the auth, devices and MFA modules, minus the network listener. */
export interface SecurityTestApp {
  app: INestApplication;
  moduleRef: TestingModule;
  email: FakeAuthEmail;
  clock: ClockService;
  close(): Promise<void>;
}

/** See the auth harness: the shared dev Mongo can be starved by concurrent agents. */
const MONGO_TIMEOUTS = { serverSelectionTimeoutMS: 120_000, connectTimeoutMS: 60_000 };

/** Boots the three security modules against the real replica set with a fake email port. */
export async function startSecurityTestApp(dbName: string): Promise<SecurityTestApp> {
  // A long access TTL on purpose. This suite drives the simulated clock forward to roll
  // TOTP windows, and with the default 15 minutes the session would expire mid-test —
  // turning an MFA assertion into an accidental token-expiry assertion. STEP_UP_TTL keeps
  // its five-minute default, because that window IS under test here.
  const { uri } = applyTestEnvironment(dbName, { JWT_ACCESS_TTL: '12h' });
  const email = new FakeAuthEmail();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      AppConfigModule,
      ClockModule,
      MongooseModule.forRoot(uri, { dbName, ...MONGO_TIMEOUTS }),
      AuthModule,
      DevicesModule,
      MfaModule,
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

  const connection = moduleRef.get<Connection>(getConnectionToken());
  await connection.dropDatabase();
  await Promise.all(Object.values(connection.models).map((model) => model.ensureIndexes()));

  const close = async (): Promise<void> => {
    await connection.dropDatabase();
    const server: unknown = app.getHttpServer();
    (server as { closeAllConnections?: () => void }).closeAllConnections?.();
    await app.close();
  };

  return { app, moduleRef, email, clock: moduleRef.get(ClockService), close };
}

/** A registered, email-verified, logged-in customer and their cookie jar. */
export async function registerAndLogin(
  harness: SecurityTestApp,
  address: string,
): Promise<{ jar: Map<string, string>; userId: string }> {
  await http(harness.app).post('/v1/auth/register').send(registrationOf(address)).expect(201);

  const token = harness.email.lastToken('verification', address);
  await http(harness.app).post('/v1/auth/verify-email').send({ token }).expect(201);

  const login = await http(harness.app)
    .post('/v1/auth/login')
    .send(loginOf(address, 'Sup3r-Secret-Passphrase'))
    .expect(201);

  const jar = jarOf(login);
  const userId = (login.body as { data: { user: { id: string } } }).data.user.id;
  return { jar, userId };
}

/** Cookie header plus the matching CSRF double-submit header for mutating calls. */
export function securedHeaders(jar: Map<string, string>): Record<string, string> {
  return { Cookie: cookieHeader(jar), [CSRF_HEADER]: jar.get(COOKIE.csrf) ?? '' };
}

/** Cookie header only, for plain reads. */
export function plainHeaders(jar: Map<string, string>): Record<string, string> {
  return { Cookie: cookieHeader(jar) };
}
