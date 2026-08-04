import { generate } from 'otplib';

import { COOKIE, ErrorCode, STEP_UP_HEADER } from '@reliance/contracts';

import { http, jarOf } from '../../auth/__tests__/test-app.js';
import { TokenService } from '../../auth/token.service.js';

import {
  plainHeaders,
  registerAndLogin,
  securedHeaders,
  startSecurityTestApp,
  type SecurityTestApp,
} from './security-test-app.js';

const ADDRESS = 'mfa-flow@example.com';
const SIX_MINUTES_MS = 360_000;
const TOTP_PERIOD_MS = 30_000;
const MILLISECONDS_PER_SECOND = 1000;
const RECOVERY_CODE_TOTAL = 10;

let harness: SecurityTestApp;
let jar: Map<string, string>;
let userId: string;
/** The one enrolment every suite shares, minted by the first test. */
let secret: string;

beforeAll(async () => {
  harness = await startSecurityTestApp('mfa_integration_test');
  ({ jar, userId } = await registerAndLogin(harness, ADDRESS));
  // Pinning the clock makes TOTP deterministic: a period only turns when a test
  // advances it deliberately, so "the same code" and "a fresh code" are exact statements.
  harness.clock.freezeAt(harness.clock.now());
}, 120_000);

afterAll(async () => {
  await harness?.close();
});

/** A TOTP code for the shared secret, minted at the current simulated instant. */
async function codeNow(): Promise<string> {
  const epoch = Math.floor(harness.clock.timestamp() / MILLISECONDS_PER_SECOND);
  return generate({ secret, epoch });
}

/** Moves to a fresh TOTP period and proves it with a step-up grant. */
async function stepUpWithTotp(): Promise<string> {
  harness.clock.advance(TOTP_PERIOD_MS + MILLISECONDS_PER_SECOND);
  const grant = await http(harness.app)
    .post('/v1/auth/step-up')
    .set(securedHeaders(jar))
    .send({ method: 'TOTP', credential: await codeNow() })
    .expect(201);

  return (grant.body as { data: { token: string } }).data.token;
}

describe('TOTP enrolment', () => {
  it('enrols, confirms, and reports MFA on the identity', async () => {
    const enrol = await http(harness.app)
      .post('/v1/mfa/totp/enrol')
      .set(securedHeaders(jar))
      .expect(201);

    secret = (enrol.body as { data: { secret: string } }).data.secret;
    expect(enrol.body.data.otpauthUri).toContain('otpauth://totp/');
    expect(enrol.body.data.qrCodeDataUri.startsWith('data:image/')).toBe(true);

    await http(harness.app)
      .post('/v1/mfa/totp/confirm')
      .set(securedHeaders(jar))
      .send({ code: await codeNow() })
      .expect(201);

    const me = await http(harness.app).get('/v1/auth/me').set(plainHeaders(jar)).expect(200);
    expect(me.body.data.mfaEnabled).toBe(true);
    expect(me.body.data.mfaMethods).toContain('TOTP');
  });

  it('cannot spend the confirmation code again — it was consumed at confirmation', async () => {
    const response = await http(harness.app)
      .post('/v1/auth/step-up')
      .set(securedHeaders(jar))
      .send({ method: 'TOTP', credential: await codeNow() });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ErrorCode.MFA_INVALID_CODE);
  });

  it('refuses a second enrolment while one is active', async () => {
    const response = await http(harness.app).post('/v1/mfa/totp/enrol').set(securedHeaders(jar));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ErrorCode.MFA_ALREADY_ENROLLED);
  });
});

describe('@StepUp window', () => {
  it('requires a fresh proof, honours it, and expires it after five minutes', async () => {
    const token = await stepUpWithTotp();

    // No proof at all: the sensitive route refuses with the contract code.
    const without = await http(harness.app).post('/v1/mfa/recovery-codes').set(securedHeaders(jar));
    expect(without.status).toBe(401);
    expect(without.body.error.code).toBe(ErrorCode.STEP_UP_REQUIRED);

    // Fresh proof: the same call succeeds.
    const within = await http(harness.app)
      .post('/v1/mfa/recovery-codes')
      .set(securedHeaders(jar))
      .set(STEP_UP_HEADER, token)
      .expect(201);
    expect(within.body.data.codes).toHaveLength(RECOVERY_CODE_TOTAL);

    // Six simulated minutes later the identical proof is stale — the window is the TTL.
    harness.clock.advance(SIX_MINUTES_MS);
    const stale = await http(harness.app)
      .post('/v1/mfa/recovery-codes')
      .set(securedHeaders(jar))
      .set(STEP_UP_HEADER, token);
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe(ErrorCode.STEP_UP_REQUIRED);
  }, 60_000);

  it('accepts a recovery code as a factor, exactly once', async () => {
    const codes = await http(harness.app)
      .post('/v1/mfa/recovery-codes')
      .set(securedHeaders(jar))
      .set(STEP_UP_HEADER, await stepUpWithTotp())
      .expect(201);

    const [code] = codes.body.data.codes as string[];
    await http(harness.app)
      .post('/v1/auth/step-up')
      .set(securedHeaders(jar))
      .send({ method: 'RECOVERY_CODE', credential: code })
      .expect(201);

    const reuse = await http(harness.app)
      .post('/v1/auth/step-up')
      .set(securedHeaders(jar))
      .send({ method: 'RECOVERY_CODE', credential: code });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe(ErrorCode.MFA_INVALID_CODE);
  }, 60_000);
});

describe('login MFA challenge', () => {
  it('completes a challenge with a valid code and sets the session cookies', async () => {
    harness.clock.advance(TOTP_PERIOD_MS + MILLISECONDS_PER_SECOND);
    const tokens = harness.moduleRef.get(TokenService);
    const challengeId = await tokens.signChallenge({ userId, deviceId: null, remember: false });

    const response = await http(harness.app)
      .post('/v1/auth/mfa/verify')
      .send({ challengeId, method: 'TOTP', code: await codeNow(), rememberDevice: false })
      .expect(201);

    expect(response.body.data.outcome).toBe('AUTHENTICATED');
    expect(response.body.data.user.id).toBe(userId);
    const freshJar = jarOf(response);
    expect(freshJar.has(COOKIE.accessToken)).toBe(true);
    expect(freshJar.has(COOKIE.refreshToken)).toBe(true);
  }, 60_000);

  it('rejects a wrong code with the contract code', async () => {
    const tokens = harness.moduleRef.get(TokenService);
    const challengeId = await tokens.signChallenge({ userId, deviceId: null, remember: false });
    const valid = await codeNow();
    const wrong = valid === '000000' ? '000001' : '000000';

    const response = await http(harness.app)
      .post('/v1/auth/mfa/verify')
      .send({ challengeId, method: 'TOTP', code: wrong, rememberDevice: false });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ErrorCode.MFA_INVALID_CODE);
  });
});

describe('TOTP disable', () => {
  it('is step-up gated and clears the enrolment', async () => {
    const refused = await http(harness.app).delete('/v1/mfa/totp').set(securedHeaders(jar));
    expect(refused.status).toBe(401);
    expect(refused.body.error.code).toBe(ErrorCode.STEP_UP_REQUIRED);

    await http(harness.app)
      .delete('/v1/mfa/totp')
      .set(securedHeaders(jar))
      .set(STEP_UP_HEADER, await stepUpWithTotp())
      .expect(200);

    const me = await http(harness.app).get('/v1/auth/me').set(plainHeaders(jar)).expect(200);
    expect(me.body.data.mfaEnabled).toBe(false);
  }, 60_000);
});

describe('passkey ceremonies', () => {
  it('issues registration options bound to a signed challenge', async () => {
    const response = await http(harness.app)
      .post('/v1/mfa/passkeys/register/options')
      .set(securedHeaders(jar))
      .expect(201);

    expect(response.body.data.challengeId.split('.')).toHaveLength(5);
    expect(response.body.data.publicKey.challenge).toBeDefined();
    expect(response.body.data.publicKey.rp.name).toBe('Reliance Bank');
  });

  it('rejects a fabricated attestation', async () => {
    const options = await http(harness.app)
      .post('/v1/mfa/passkeys/register/options')
      .set(securedHeaders(jar))
      .expect(201);

    const response = await http(harness.app)
      .post('/v1/mfa/passkeys/register/verify')
      .set(securedHeaders(jar))
      .send({ challengeId: options.body.data.challengeId, credential: { id: 'invented' } });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ErrorCode.PASSKEY_VERIFICATION_FAILED);
  });

  it('issues authentication options limited to the customer credentials', async () => {
    const response = await http(harness.app)
      .post('/v1/mfa/passkeys/authenticate/options')
      .set(plainHeaders(jar))
      .expect(201);

    expect(response.body.data.challengeId).toBeDefined();
    expect(response.body.data.publicKey.allowCredentials).toEqual([]);
  });
});
