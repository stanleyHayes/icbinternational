import { DeviceTrust, MfaMethod } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import { type TokenService } from '../../auth/token.service.js';
import { type UserDocument } from '../../auth/users/index.js';
import { type DeviceDocument } from '../device.schema.js';
import { type DeviceService } from '../device.service.js';
import { LoginGateKind, LoginMfaGate, type LoginGateInput } from '../login-mfa.gate.js';

const USER_ID = 'usr_01HZY0M4V0D2T0FH0GN3J1Q0AA';
const DEVICE_ID = 'dev_01HZY5TCA5J7Y5KM5MT8P6V5FF';
const CHALLENGE_ID = 'challenge-token';
const EXPIRES = new Date('2026-02-01T12:05:00.000Z');

function deviceWith(trust: DeviceTrust): DeviceDocument {
  return { id: DEVICE_ID, trust } as unknown as DeviceDocument;
}

function userWith(mfa: Partial<UserDocument['mfa']>): UserDocument {
  return {
    id: USER_ID,
    mfa: {
      totpSecret: 'sealed',
      enrolled: true,
      recoveryCodeHashes: [],
      methods: [MfaMethod.TOTP],
      enrolledAt: new Date('2026-01-01T00:00:00.000Z'),
      lastTimeStep: null,
      ...mfa,
    },
  } as unknown as UserDocument;
}

function inputFor(user: UserDocument): LoginGateInput {
  return {
    user,
    fingerprint: 'fp-gate-test-000001',
    rememberDevice: true,
    origin: { ip: '198.51.100.7', userAgent: 'Mozilla/5.0' },
  };
}

function build(trust: DeviceTrust): { gate: LoginMfaGate } {
  const devices = {
    recognise: () => Promise.resolve({ device: deviceWith(trust), isFirstSighting: false }),
    assertNotBlocked(device: DeviceDocument): void {
      if (device.trust === DeviceTrust.BLOCKED) {
        throw AppError.forbidden('This device has been blocked from accessing the account.');
      }
    },
    isTrusted: (device: DeviceDocument) => device.trust === DeviceTrust.TRUSTED,
  } as unknown as DeviceService;

  const tokens = {
    signChallenge: () => Promise.resolve(CHALLENGE_ID),
    challengeExpiresAt: () => EXPIRES,
  } as unknown as TokenService;

  return { gate: new LoginMfaGate(devices, tokens) };
}

describe('LoginMfaGate', () => {
  it('clears the login with the recognised device when MFA is not enrolled', async () => {
    const { gate } = build(DeviceTrust.RECOGNISED);
    const user = userWith({ enrolled: false });

    const decision = await gate.decide(inputFor(user));

    expect(decision).toEqual({ kind: LoginGateKind.PROCEED, deviceId: DEVICE_ID });
  });

  it('clears an enrolled login on a trusted device', async () => {
    const { gate } = build(DeviceTrust.TRUSTED);

    const decision = await gate.decide(inputFor(userWith({})));

    expect(decision.kind).toBe(LoginGateKind.PROCEED);
  });

  it('challenges an enrolled login on an untrusted device, naming usable factors', async () => {
    const { gate } = build(DeviceTrust.RECOGNISED);
    const user = userWith({ recoveryCodeHashes: ['hash'] });

    const decision = await gate.decide(inputFor(user));

    expect(decision).toEqual({
      kind: LoginGateKind.CHALLENGE,
      challengeId: CHALLENGE_ID,
      methods: [MfaMethod.TOTP, MfaMethod.RECOVERY_CODE],
      expiresAt: EXPIRES.toISOString(),
    });
  });

  it('does not offer recovery codes once the last one is spent', async () => {
    const { gate } = build(DeviceTrust.UNKNOWN);

    const decision = await gate.decide(inputFor(userWith({})));

    expect(decision.kind).toBe(LoginGateKind.CHALLENGE);
    if (decision.kind === LoginGateKind.CHALLENGE) {
      expect(decision.methods).toEqual([MfaMethod.TOTP]);
    }
  });

  it('refuses a blocked device even with the password already verified', async () => {
    const { gate } = build(DeviceTrust.BLOCKED);

    const failure = await gate.decide(inputFor(userWith({}))).catch((error: unknown) => error);

    expect((failure as AppError).code).toBe('FORBIDDEN');
  });
});
