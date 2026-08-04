import { COOKIE, CSRF_HEADER, ErrorCode } from '@reliance/contracts';

import { cookieHeader, http, jarOf, startTestApp, type TestApp } from './test-app.js';
import { loginOf, registrationOf } from './test-environment.js';

jest.setTimeout(600_000);

const DB_NAME = 'auth_test_session';
const MARGARET = 'margaret@example.com';
/* eslint-disable sonarjs/no-hardcoded-passwords -- fixture credentials for throwaway test accounts */
const PASSWORD = 'Sup3r-Secret-Passphrase';
const NEW_PASSWORD = 'N3w-Secret-Passphrase';
/* eslint-enable sonarjs/no-hardcoded-passwords */

let context: TestApp;

beforeAll(async () => {
  context = await startTestApp(DB_NAME);
  const agent = http(context.app);
  await agent.post('/v1/auth/register').send(registrationOf(MARGARET));
  const token = context.email.lastToken('verification', MARGARET);
  await agent.post('/v1/auth/verify-email').send({ token });
});

afterAll(async () => {
  await context.close();
});

function agent() {
  return http(context.app);
}

function login(password: string = PASSWORD) {
  return agent().post('/v1/auth/login').send(loginOf(MARGARET, password));
}

function withCsrf(jar: Map<string, string>) {
  return { Cookie: cookieHeader(jar), [CSRF_HEADER]: jar.get(COOKIE.csrf) ?? '' };
}

describe('refresh rotation', () => {
  it('refuses a refresh without the CSRF header', async () => {
    const jar = jarOf(await login());

    const response = await agent().post('/v1/auth/refresh').set('Cookie', cookieHeader(jar));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('rotates the pair, killing the previous access and refresh tokens', async () => {
    const first = jarOf(await login());

    const refreshed = await agent().post('/v1/auth/refresh').set(withCsrf(first));

    expect(refreshed.status).toBe(201);
    const second = jarOf(refreshed);
    expect(second.get(COOKIE.refreshToken)).toBeDefined();
    expect(second.get(COOKIE.refreshToken)).not.toBe(first.get(COOKIE.refreshToken));

    const meWithOldAccess = await agent().get('/v1/auth/me').set('Cookie', cookieHeader(first));
    expect(meWithOldAccess.status).toBe(401);

    const meWithNewAccess = await agent().get('/v1/auth/me').set('Cookie', cookieHeader(second));
    expect(meWithNewAccess.status).toBe(200);
  });

  it('detects reuse of a spent refresh token and revokes the whole family', async () => {
    const first = jarOf(await login());
    const refreshed = await agent().post('/v1/auth/refresh').set(withCsrf(first));
    const second = jarOf(refreshed);

    // The spent token turns up again — replayed by a thief or a buggy client.
    const reuse = await agent().post('/v1/auth/refresh').set(withCsrf(first));

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe(ErrorCode.TOKEN_REUSE_DETECTED);

    // The honest client's newest token is dead too: the family is gone.
    const afterRevocation = await agent().post('/v1/auth/refresh').set(withCsrf(second));
    expect(afterRevocation.status).toBe(401);
    expect(afterRevocation.body.error.code).toBe(ErrorCode.TOKEN_INVALID);

    const meAfter = await agent().get('/v1/auth/me').set('Cookie', cookieHeader(second));
    expect(meAfter.status).toBe(401);
  });
});

describe('logout', () => {
  it('ends the session immediately and expires the cookies', async () => {
    const jar = jarOf(await login());

    const response = await agent().post('/v1/auth/logout').set(withCsrf(jar));

    expect(response.status).toBe(201);

    const me = await agent().get('/v1/auth/me').set('Cookie', cookieHeader(jar));
    expect(me.status).toBe(401);

    const refresh = await agent().post('/v1/auth/refresh').set(withCsrf(jar));
    expect(refresh.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
  });
});

describe('forgot and reset password', () => {
  it('answers identically for known and unknown addresses', async () => {
    const known = await agent().post('/v1/auth/forgot-password').send({ email: MARGARET });
    const unknown = await agent()
      .post('/v1/auth/forgot-password')
      .send({ email: 'ghost@example.com' });

    expect(known.status).toBe(201);
    expect(unknown.status).toBe(201);
    expect(known.body).toEqual(unknown.body);
  });

  it('resets the password, kills every session, and accepts the new password', async () => {
    const sessionBefore = jarOf(await login());

    await agent().post('/v1/auth/forgot-password').send({ email: MARGARET });
    const token = context.email.lastToken('reset', MARGARET);
    const reset = await agent()
      .post('/v1/auth/reset-password')
      .send({ token, password: NEW_PASSWORD });
    expect(reset.status).toBe(201);

    // The link is single-use.
    const replay = await agent()
      .post('/v1/auth/reset-password')
      .send({ token, password: NEW_PASSWORD });
    expect(replay.body.error.code).toBe(ErrorCode.TOKEN_INVALID);

    // Sessions from before the reset are revoked.
    const oldRefresh = await agent().post('/v1/auth/refresh').set(withCsrf(sessionBefore));
    expect(oldRefresh.body.error.code).toBe(ErrorCode.TOKEN_INVALID);

    const oldPassword = await login(PASSWORD);
    expect(oldPassword.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);

    const newPassword = await login(NEW_PASSWORD);
    expect(newPassword.status).toBe(201);
  });
});

describe('change password', () => {
  it('rejects a wrong current password and revokes other sessions on success', async () => {
    const current = jarOf(await login(NEW_PASSWORD));
    const other = jarOf(await login(NEW_PASSWORD));

    const wrong = await agent()
      .post('/v1/auth/change-password')
      .set(withCsrf(current))
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- fixture credential, not real
      .send({ currentPassword: 'Wr0ng-Password-000', newPassword: PASSWORD });
    expect(wrong.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);

    const changed = await agent()
      .post('/v1/auth/change-password')
      .set(withCsrf(current))
      .send({ currentPassword: NEW_PASSWORD, newPassword: PASSWORD });
    expect(changed.status).toBe(201);

    // The session that proved the password survives; every other one is gone.
    const meCurrent = await agent().get('/v1/auth/me').set('Cookie', cookieHeader(current));
    expect(meCurrent.status).toBe(200);

    const meOther = await agent().get('/v1/auth/me').set('Cookie', cookieHeader(other));
    expect(meOther.status).toBe(401);

    const refreshOther = await agent().post('/v1/auth/refresh').set(withCsrf(other));
    expect(refreshOther.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
  });
});
