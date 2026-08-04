import { COOKIE, ErrorCode } from '@reliance/contracts';

import { cookieHeader, http, jarOf, startTestApp, type TestApp } from './test-app.js';
import { loginOf, registrationOf } from './test-environment.js';

jest.setTimeout(600_000);

const DB_NAME = 'auth_test_flow';
const ADA = 'ada@example.com';
const GRACE = 'grace@example.com';
// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- fixture credential for a throwaway test account
const PASSWORD = 'Sup3r-Secret-Passphrase';

let context: TestApp;

beforeAll(async () => {
  context = await startTestApp(DB_NAME);
});

afterAll(async () => {
  await context.close();
});

function agent() {
  return http(context.app);
}

async function register(email: string) {
  return agent().post('/v1/auth/register').send(registrationOf(email));
}

async function verify(email: string) {
  const token = context.email.lastToken('verification', email);
  return agent().post('/v1/auth/verify-email').send({ token });
}

async function login(email: string, password: string) {
  return agent().post('/v1/auth/login').send(loginOf(email, password));
}

describe('registration and email verification', () => {
  it('registers a customer as PENDING_VERIFICATION and sets no session cookies', async () => {
    const response = await register(ADA);

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe(ADA);
    expect(response.body.data.emailVerified).toBe(false);
    expect(response.body.data.status).toBe('PENDING_VERIFICATION');
    expect(response.body.data.id).toMatch(/^usr_/);
    expect(response.body.data.passwordHash).toBeUndefined();
    expect(jarOf(response).has(COOKIE.accessToken)).toBe(false);
  });

  it('rejects a duplicate email with the contract conflict code', async () => {
    const response = await register(ADA);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ErrorCode.EMAIL_ALREADY_REGISTERED);
  });

  it('rejects an invalid payload field-by-field', async () => {
    const response = await agent()
      .post('/v1/auth/register')
      .send({ ...registrationOf('bad@example.com'), password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(response.body.error.details[0].path).toBe('password');
  });

  it('refuses login before the address is confirmed', async () => {
    const response = await login(ADA, PASSWORD);

    expect(response.body.error.code).toBe(ErrorCode.EMAIL_NOT_VERIFIED);
  });

  it('rejects a made-up verification token', async () => {
    const response = await agent()
      .post('/v1/auth/verify-email')
      .send({ token: 'this-token-was-never-issued' });

    expect(response.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
  });

  it('activates the account when the emailed link is redeemed', async () => {
    const response = await verify(ADA);

    expect(response.status).toBe(201);
    expect(response.body.data.emailVerified).toBe(true);
    expect(response.body.data.status).toBe('ACTIVE');
  });
});

describe('login, lockout and the authenticated guard', () => {
  it('answers a wrong password and an unknown email identically', async () => {
    const wrongPassword = await login(ADA, 'Wr0ng-Password-000');
    const unknownEmail = await login('nobody@example.com', 'Wr0ng-Password-000');

    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('locks the account after the configured number of failures', async () => {
    // One failure already happened in the previous test; two more spend the budget.
    await login(ADA, 'Wr0ng-Password-000');
    const locked = await login(ADA, 'Wr0ng-Password-000');

    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe(ErrorCode.ACCOUNT_LOCKED);
    expect(locked.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(locked.headers['retry-after']).toBeDefined();
  });

  it('keeps refusing while the lockout runs, even with the right password', async () => {
    const response = await login(ADA, PASSWORD);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ErrorCode.ACCOUNT_LOCKED);
  });

  it('logs a verified customer in and sets the three cookies', async () => {
    await register(GRACE);
    await verify(GRACE);

    const response = await login(GRACE, PASSWORD);

    expect(response.status).toBe(201);
    expect(response.body.data.outcome).toBe('AUTHENTICATED');
    expect(response.body.data.user.email).toBe(GRACE);

    const jar = jarOf(response);
    expect(jar.has(COOKIE.accessToken)).toBe(true);
    expect(jar.has(COOKIE.refreshToken)).toBe(true);
    expect(jar.has(COOKIE.csrf)).toBe(true);

    const setCookie = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
    const accessLine = setCookie.find((line) => line.startsWith(`${COOKIE.accessToken}=`));
    const csrfLine = setCookie.find((line) => line.startsWith(`${COOKIE.csrf}=`));
    expect(accessLine).toContain('HttpOnly');
    expect(csrfLine).not.toContain('HttpOnly');
  });

  it('answers /auth/me with the authenticated user', async () => {
    const loginResponse = await login(GRACE, PASSWORD);
    const jar = jarOf(loginResponse);

    const response = await agent().get('/v1/auth/me').set('Cookie', cookieHeader(jar));

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(GRACE);
  });

  it('rejects /auth/me without a token', async () => {
    const response = await agent().get('/v1/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('rejects /auth/me with a garbled token', async () => {
    const response = await agent()
      .get('/v1/auth/me')
      .set('Cookie', `${COOKIE.accessToken}=garbage`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
  });

  it('accepts a Bearer header in place of the cookie', async () => {
    const loginResponse = await login(GRACE, PASSWORD);
    const accessToken = jarOf(loginResponse).get(COOKIE.accessToken) ?? '';

    const response = await agent().get('/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(GRACE);
  });
});
