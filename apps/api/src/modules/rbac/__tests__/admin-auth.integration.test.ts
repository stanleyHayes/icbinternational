import { Controller, Get, type INestApplication } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { type Connection } from 'mongoose';
import { generate } from 'otplib';

import { AdminRole, adminUserSchema, ErrorCode, Permission, routes } from '@reliance/contracts';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { ClockService } from '../../../common/clock/clock.service.js';
import { AppExceptionFilter } from '../../../common/errors/exception.filter.js';
import { ResponseEnvelopeInterceptor } from '../../../common/interceptors/response.interceptor.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { cookieHeader, http, jarOf } from '../../auth/__tests__/test-app.js';
import { applyTestEnvironment } from '../../auth/__tests__/test-environment.js';
import { AdminEndpoint } from '../admin-endpoint.decorator.js';
import { AdminUserService } from '../admin-user.service.js';
import { ADMIN_ACCESS_COOKIE, ADMIN_LOGOUT_ROUTE } from '../rbac.constants.js';
import { RbacModule } from '../rbac.module.js';

/**
 * Staff sign-in, end to end, against the real replica set.
 *
 * The question this file answers is the one the console could not answer before: can a
 * seeded operator actually get in, and does the token they get back open a guarded admin
 * route? Everything else here is the other half of that — the refusals that must happen,
 * and must not say more than they should.
 *
 * The clock is frozen so that "the same code" and "a fresh code" are exact statements
 * rather than a race with the thirty-second TOTP period.
 */

const DATABASE = 'reliancebank_admin_auth_test';

const AGENT_EMAIL = 'ida.fenwick@reliancebank.example';
const AGENT_SECRET = 'KRSXG5CTMVRXEZLUFVZWK4TFOJZGK5DF';
// A fixture credential for a throwaway staff account, never a real one.
// eslint-disable-next-line sonarjs/no-hardcoded-passwords
const AGENT_PASSWORD = 'Reliance-Integration-Console-2026';

const UNENROLLED_EMAIL = 'noel.abara@reliancebank.example';
// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- a string that must not work
const WRONG_PASSWORD = 'Not-The-Password-2026';

const MILLISECONDS_PER_SECOND = 1000;
const TOTP_PERIOD_MS = 30_000;
const MONGO_TIMEOUTS = { serverSelectionTimeoutMS: 120_000, connectTimeoutMS: 60_000 };

jest.setTimeout(240_000);

/**
 * A real shipped admin route, mounted alone.
 *
 * Bound to the contract path and the permission the tickets queue actually requires, so
 * "reaches an `@AdminEndpoint()` route" means the whole chain — authentication, allowlist,
 * permission — and not a bespoke guard arrangement that only exists in this file.
 */
@Controller()
class TicketsProbeController {
  @Get(routes.admin.tickets)
  @AdminEndpoint(Permission.TICKET_MANAGE)
  queue(): { reached: true } {
    return { reached: true };
  }
}

interface ErrorBody {
  error: { code: string; message: string };
}

let app: INestApplication;
let moduleRef: TestingModule;
let clock: ClockService;

beforeAll(async () => {
  const { uri } = applyTestEnvironment(DATABASE);

  moduleRef = await Test.createTestingModule({
    imports: [
      AppConfigModule,
      ClockModule,
      MongooseModule.forRoot(uri, { dbName: DATABASE, ...MONGO_TIMEOUTS }),
      RbacModule,
    ],
    controllers: [TicketsProbeController],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1');
  app.use(cookieParser(process.env['CSRF_SECRET'] ?? ''));
  app.useGlobalFilters(new AppExceptionFilter(moduleRef.get(ClockService)));
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  await app.init();

  const connection = moduleRef.get<Connection>(getConnectionToken());
  await connection.dropDatabase();
  await Promise.all(Object.values(connection.models).map((model) => model.ensureIndexes()));

  clock = moduleRef.get(ClockService);
  clock.freezeAt(clock.now());

  const admins = moduleRef.get(AdminUserService);
  await admins.provision({
    email: AGENT_EMAIL,
    fullName: 'Ida Fenwick',
    roles: [AdminRole.SUPPORT_AGENT],
    password: AGENT_PASSWORD,
    totpSecret: AGENT_SECRET,
  });
  await admins.provision({
    email: UNENROLLED_EMAIL,
    fullName: 'Noel Abara',
    roles: [AdminRole.SUPPORT_AGENT],
    password: AGENT_PASSWORD,
  });
}, 240_000);

afterAll(async () => {
  const connection = moduleRef?.get<Connection>(getConnectionToken());
  await connection?.dropDatabase();
  const server: unknown = app?.getHttpServer();
  (server as { closeAllConnections?: () => void } | undefined)?.closeAllConnections?.();
  await app?.close();
});

/** A code for the operator's authenticator at the current simulated instant. */
async function codeNow(secret = AGENT_SECRET): Promise<string> {
  const epoch = Math.floor(clock.timestamp() / MILLISECONDS_PER_SECOND);
  return generate({ secret, epoch });
}

/** Moves to a fresh TOTP period, so one test's code cannot be another's replay. */
function nextPeriod(): void {
  clock.advance(TOTP_PERIOD_MS + MILLISECONDS_PER_SECOND);
}

async function signIn(body: Record<string, unknown>, status: number) {
  return http(app).post(`/v1${routes.admin.login}`).send(body).expect(status);
}

/** A completed sign-in, returning the session cookie header the console would hold. */
async function signInAsAgent(): Promise<string> {
  nextPeriod();
  const response = await signIn(
    { email: AGENT_EMAIL, password: AGENT_PASSWORD, totpCode: await codeNow() },
    201,
  );
  return cookieHeader(jarOf(response));
}

describe('POST /admin/auth/login', () => {
  it('signs an operator in, sets an httpOnly session cookie, and answers with the staff DTO', async () => {
    nextPeriod();
    const response = await signIn(
      { email: AGENT_EMAIL, password: AGENT_PASSWORD, totpCode: await codeNow() },
      201,
    );

    expect(() => adminUserSchema.parse(response.body.data)).not.toThrow();
    expect(response.body.data.email).toBe(AGENT_EMAIL);
    expect(response.body.data.permissions).toContain(Permission.TICKET_MANAGE);
    // The token is never in the body — what script cannot read, an injection cannot steal.
    expect(JSON.stringify(response.body)).not.toContain('eyJ');

    const setCookie = response.headers['set-cookie'] as unknown as string[];
    const session = setCookie.find((line) => line.startsWith(`${ADMIN_ACCESS_COOKIE}=`));
    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=Lax');
  });

  it('reaches an @AdminEndpoint() route with nothing but the session cookie', async () => {
    const cookie = await signInAsAgent();

    const reached = await http(app)
      .get(`/v1${routes.admin.tickets}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(reached.body.data.reached).toBe(true);
  });

  it('answers "who am I" with the permissions the guards authorise on', async () => {
    const cookie = await signInAsAgent();

    const me = await http(app).get(`/v1${routes.admin.me}`).set('Cookie', cookie).expect(200);

    expect(() => adminUserSchema.parse(me.body.data)).not.toThrow();
    expect(me.body.data.email).toBe(AGENT_EMAIL);
    expect(me.body.data.mfaEnrolled).toBe(true);
    // Stamped by the sign-in that produced this cookie.
    expect(me.body.data.lastLoginAt).not.toBeNull();
  });

  it('still accepts the bearer form, for callers that are not a browser', async () => {
    nextPeriod();
    const response = await signIn(
      { email: AGENT_EMAIL, password: AGENT_PASSWORD, totpCode: await codeNow() },
      201,
    );
    const token = jarOf(response).get(ADMIN_ACCESS_COOKIE) ?? '';

    const reached = await http(app)
      .get(`/v1${routes.admin.tickets}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(reached.body.data.reached).toBe(true);
  });
});

describe('the refusals', () => {
  it('refuses a wrong authenticator code and opens no session', async () => {
    nextPeriod();
    const response = await signIn(
      { email: AGENT_EMAIL, password: AGENT_PASSWORD, totpCode: '000000' },
      401,
    );

    expect((response.body as ErrorBody).error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('refuses the same code twice — a spent time step cannot be replayed', async () => {
    nextPeriod();
    const code = await codeNow();
    await signIn({ email: AGENT_EMAIL, password: AGENT_PASSWORD, totpCode: code }, 201);

    const replay = await signIn(
      { email: AGENT_EMAIL, password: AGENT_PASSWORD, totpCode: code },
      401,
    );
    expect((replay.body as ErrorBody).error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
  });

  it('answers an unknown address exactly as it answers a wrong password', async () => {
    nextPeriod();
    const code = await codeNow();

    const unknown = await signIn(
      { email: 'nobody@reliancebank.example', password: AGENT_PASSWORD, totpCode: code },
      401,
    );
    const wrongPassword = await signIn(
      { email: AGENT_EMAIL, password: WRONG_PASSWORD, totpCode: code },
      401,
    );

    // Same code, same message, same status. Anything else is an oracle listing who works
    // here, and the decoy hash on the unknown branch is there so the timing matches too.
    expect((unknown.body as ErrorBody).error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect((unknown.body as ErrorBody).error.code).toBe(
      (wrongPassword.body as ErrorBody).error.code,
    );
    expect((unknown.body as ErrorBody).error.message).toBe(
      (wrongPassword.body as ErrorBody).error.message,
    );
  });

  it('names a missing authenticator, because no retry can fix it', async () => {
    nextPeriod();
    const response = await signIn(
      { email: UNENROLLED_EMAIL, password: AGENT_PASSWORD, totpCode: await codeNow() },
      400,
    );

    expect((response.body as ErrorBody).error.code).toBe(ErrorCode.MFA_NOT_ENROLLED);
  });

  it('rejects a code that is not six digits before it reaches the operator record', async () => {
    const response = await signIn(
      { email: AGENT_EMAIL, password: AGENT_PASSWORD, totpCode: 'abc' },
      400,
    );

    expect((response.body as ErrorBody).error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('refuses the guarded route with no session at all', async () => {
    const response = await http(app).get(`/v1${routes.admin.tickets}`).expect(401);
    expect((response.body as ErrorBody).error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });
});

describe('POST /admin/auth/logout', () => {
  it('expires the session cookie in the browser', async () => {
    const cookie = await signInAsAgent();

    const response = await http(app)
      .post(`/v1${ADMIN_LOGOUT_ROUTE}`)
      .set('Cookie', cookie)
      .expect(201);

    const cleared = (response.headers['set-cookie'] as unknown as string[]).find((line) =>
      line.startsWith(`${ADMIN_ACCESS_COOKIE}=`),
    );
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
  });
});
