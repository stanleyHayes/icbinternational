import { ErrorCode } from '@reliance/contracts';

import { http } from '../../auth/__tests__/test-app.js';
import { loginOf } from '../../auth/__tests__/test-environment.js';
import { SessionService } from '../../auth/session.service.js';
import {
  plainHeaders,
  registerAndLogin,
  securedHeaders,
  startSecurityTestApp,
  type SecurityTestApp,
} from '../../mfa/__tests__/security-test-app.js';
import { DeviceService } from '../device.service.js';

const ADA = 'devices-ada@example.com';
const GRACE = 'devices-grace@example.com';
const FINGERPRINT = 'fp-devices-test-0001';
// A fixture credential for throwaway test accounts, never a real one.
// eslint-disable-next-line sonarjs/no-hardcoded-passwords
const PASSWORD = 'Sup3r-Secret-Passphrase';
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ORIGIN = { ip: '203.0.113.10', userAgent: CHROME_UA };

let harness: SecurityTestApp;
let jar: Map<string, string>;
let userId: string;

beforeAll(async () => {
  harness = await startSecurityTestApp('devices_integration_test');
  ({ jar, userId } = await registerAndLogin(harness, ADA));
}, 120_000);

afterAll(async () => {
  await harness?.close();
});

async function recogniseTwice(): Promise<string> {
  const devices = harness.moduleRef.get(DeviceService);
  await devices.recognise({ userId, fingerprint: FINGERPRINT, origin: ORIGIN });
  const second = await devices.recognise({ userId, fingerprint: FINGERPRINT, origin: ORIGIN });
  return second.device.id;
}

describe('device recognition and listing', () => {
  it('lists the device sighted by the login itself', async () => {
    const response = await http(harness.app).get('/v1/devices').set(plainHeaders(jar)).expect(200);

    // Login goes through the MFA gate, which sights the arriving device — so a brand-new
    // account already knows the one machine it signed in from.
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].trust).toBe('UNKNOWN');
    expect(response.body.page.hasMore).toBe(false);
  });

  it('promotes a seen-before fingerprint from UNKNOWN to RECOGNISED', async () => {
    await recogniseTwice();

    const response = await http(harness.app).get('/v1/devices').set(plainHeaders(jar)).expect(200);

    const seen = (response.body.data as { label: string; trust: string; platform: string }[]).find(
      (entry) => entry.label === 'Chrome on macOS',
    );
    expect(response.body.data).toHaveLength(2);
    expect(seen?.trust).toBe('RECOGNISED');
    expect(seen?.platform).toBe('macOS');
  });
});

describe('session list and remote revoke', () => {
  it('lists the live session and flags it as current', async () => {
    const response = await http(harness.app).get('/v1/sessions').set(plainHeaders(jar)).expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].current).toBe(true);
    expect(response.body.data[0].ipAddress).toBeDefined();
  });

  it('refuses to revoke the session making the request', async () => {
    const list = await http(harness.app).get('/v1/sessions').set(plainHeaders(jar)).expect(200);
    const currentId = list.body.data[0].id as string;

    const response = await http(harness.app)
      .delete(`/v1/sessions/${currentId}`)
      .set(securedHeaders(jar));

    expect(response.status).toBe(412);
    expect(response.body.error.code).toBe(ErrorCode.PRECONDITION_FAILED);
  });

  it('revokes another session, which immediately stops working', async () => {
    const second = await http(harness.app)
      .post('/v1/auth/login')
      .send(loginOf(ADA, PASSWORD))
      .expect(201);
    const secondJar = new Map<string, string>();
    for (const line of Array.isArray(second.headers['set-cookie'])
      ? second.headers['set-cookie']
      : []) {
      const [pair] = line.split(';');
      const at = pair?.indexOf('=') ?? -1;
      if (pair && at > 0) secondJar.set(pair.slice(0, at), pair.slice(at + 1));
    }

    const list = await http(harness.app).get('/v1/sessions').set(plainHeaders(jar)).expect(200);
    expect(list.body.data).toHaveLength(2);
    const otherId = (list.body.data as { id: string; current: boolean }[]).find(
      (entry) => !entry.current,
    )?.id as string;

    await http(harness.app).delete(`/v1/sessions/${otherId}`).set(securedHeaders(jar)).expect(200);

    const revived = await http(harness.app).get('/v1/auth/me').set(plainHeaders(secondJar));
    expect(revived.status).toBe(401);

    const mine = await http(harness.app).get('/v1/auth/me').set(plainHeaders(jar)).expect(200);
    expect(mine.body.data.id).toBe(userId);
  });

  it('revoke-all spares exactly the requesting session', async () => {
    await http(harness.app).post('/v1/auth/login').send(loginOf(ADA, PASSWORD)).expect(201);
    await http(harness.app).post('/v1/auth/login').send(loginOf(ADA, PASSWORD)).expect(201);

    await http(harness.app).post('/v1/sessions/revoke-all').set(securedHeaders(jar)).expect(201);

    const list = await http(harness.app).get('/v1/sessions').set(plainHeaders(jar)).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].current).toBe(true);
  });
});

describe('device removal', () => {
  it('blocks the device and revokes sessions bound to it', async () => {
    const deviceId = await recogniseTwice();
    const sessions = harness.moduleRef.get(SessionService);
    const bound = await sessions.create(userId, deviceId, ORIGIN);

    await http(harness.app).delete(`/v1/devices/${deviceId}`).set(securedHeaders(jar)).expect(200);

    const devices = await http(harness.app).get('/v1/devices').set(plainHeaders(jar)).expect(200);
    const removed = (devices.body.data as { id: string; trust: string }[]).find(
      (entry) => entry.id === deviceId,
    );
    expect(removed?.trust).toBe('BLOCKED');
    expect(await sessions.isLive(bound.session.id)).toBe(false);

    const gate = harness.moduleRef.get(DeviceService);
    const sighting = await gate.recognise({ userId, fingerprint: FINGERPRINT, origin: ORIGIN });
    expect(() => gate.assertNotBlocked(sighting.device)).toThrow(/blocked/i);
  });

  it('answers a foreign device id with a plain not-found', async () => {
    const other = await registerAndLogin(harness, GRACE);
    const devices = await http(harness.app).get('/v1/devices').set(plainHeaders(jar)).expect(200);
    const adasDeviceId = devices.body.data[0].id as string;

    const response = await http(harness.app)
      .delete(`/v1/devices/${adasDeviceId}`)
      .set(securedHeaders(other.jar));

    expect(response.status).toBe(404);
  });
});
