import { ErrorCode, MfaMethod } from '@reliance/contracts';

import { type AppError } from '../../../common/errors/app-error.js';
import { type UserDocument, type UserRepository } from '../../auth/users/index.js';
import { FactorVerificationService } from '../factor-verification.service.js';
import { type PasskeyService } from '../passkey.service.js';
import { RecoveryCodeService } from '../recovery-code.service.js';
import { type TotpAcceptance, type TotpService } from '../totp.service.js';

const USER_ID = 'usr_01HZY0M4V0D2T0FH0GN3J1Q0AA';

function userWith(overrides: Partial<UserDocument['mfa']>): UserDocument {
  return {
    id: USER_ID,
    mfa: {
      totpSecret: 'sealed',
      enrolled: true,
      recoveryCodeHashes: [],
      methods: [MfaMethod.TOTP],
      enrolledAt: null,
      lastTimeStep: null,
      ...overrides,
    },
  } as unknown as UserDocument;
}

function build(options: {
  user: UserDocument | null;
  totpResult?: TotpAcceptance;
  updateResult?: UserDocument | null;
}): { factors: FactorVerificationService; passkeys: { calls: number } } {
  const users = {
    findCredentialsById: () => Promise.resolve(options.user),
    updateOne: () =>
      Promise.resolve(options.updateResult === undefined ? options.user : options.updateResult),
  } as unknown as UserRepository;

  const totp = {
    check: () => Promise.resolve(options.totpResult ?? { accepted: false, timeStep: null }),
  } as unknown as TotpService;

  const passkeySpy = { calls: 0 };
  const passkeys = {
    verifyAssertion: () => {
      passkeySpy.calls += 1;
      return Promise.resolve({ passkey: null, deviceId: 'dev_x' });
    },
  } as unknown as PasskeyService;

  return {
    factors: new FactorVerificationService(users, totp, new RecoveryCodeService(), passkeys),
    passkeys: passkeySpy,
  };
}

describe('FactorVerificationService.verifyTotp', () => {
  it('requires an active enrolment', async () => {
    const { factors } = build({ user: userWith({ enrolled: false }) });

    const failure = await factors.verifyTotp(USER_ID, '123456').catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.MFA_NOT_ENROLLED);
  });

  it('rejects a code whose step was already spent by a concurrent request', async () => {
    const { factors } = build({
      user: userWith({}),
      totpResult: { accepted: true, timeStep: 42 },
      updateResult: null,
    });

    const failure = await factors.verifyTotp(USER_ID, '123456').catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.MFA_INVALID_CODE);
  });

  it('accepts and atomically records the time step', async () => {
    const { factors } = build({ user: userWith({}), totpResult: { accepted: true, timeStep: 42 } });

    await expect(factors.verifyTotp(USER_ID, '123456')).resolves.toBeUndefined();
  });
});

describe('FactorVerificationService.consumeRecoveryCode', () => {
  it('rejects a code that is not in the unspent set', async () => {
    const { factors } = build({ user: userWith({}), updateResult: null });

    const failure = await factors
      .consumeRecoveryCode(USER_ID, 'AAAAA-AAAAA')
      .catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.MFA_INVALID_CODE);
  });
});

describe('FactorVerificationService.verifyPasskey', () => {
  it('treats a malformed assertion payload as a wrong factor', async () => {
    const { factors, passkeys } = build({ user: userWith({}) });

    const failure = await factors
      .verifyPasskey(USER_ID, 'this-is-not-json')
      .catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.MFA_INVALID_CODE);
    expect(passkeys.calls).toBe(0);
  });

  it('delegates a well-formed assertion to the passkey ceremony', async () => {
    const { factors, passkeys } = build({ user: userWith({}) });
    const payload = JSON.stringify({ challengeId: 'ceremony', credential: { id: 'cred' } });

    await expect(factors.verifyPasskey(USER_ID, payload)).resolves.toBeUndefined();
    expect(passkeys.calls).toBe(1);
  });
});
