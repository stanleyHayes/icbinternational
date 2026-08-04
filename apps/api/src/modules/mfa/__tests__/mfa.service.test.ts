import { generate } from 'otplib';

import { ErrorCode, MfaMethod } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { type AppError } from '../../../common/errors/app-error.js';
import { AppConfigService } from '../../../config/config.service.js';
import { testConfig } from '../../auth/__tests__/test-environment.js';
import { SecretCipher } from '../../auth/support/secret-cipher.js';
import { type UserDocument, type UserMfa } from '../../auth/users/index.js';
import { MfaService } from '../mfa.service.js';
import { RecoveryCodeService } from '../recovery-code.service.js';
import { TotpService } from '../totp.service.js';

const USER_ID = 'usr_01HZY0M4V0D2T0FH0GN3J1Q0AA';
const MILLISECONDS_PER_SECOND = 1000;

function blankMfa(): UserMfa {
  return {
    totpSecret: null,
    enrolled: false,
    recoveryCodeHashes: [],
    methods: [],
    enrolledAt: null,
    lastTimeStep: null,
  };
}

class FakeUserRepository {
  document: UserDocument;

  constructor() {
    this.document = {
      id: USER_ID,
      email: 'ada@example.com',
      mfa: blankMfa(),
    } as unknown as UserDocument;
  }

  async findCredentialsById(id: string): Promise<UserDocument | null> {
    return id === USER_ID ? this.document : null;
  }

  async patch(_id: string, update: Record<string, unknown>): Promise<UserDocument | null> {
    const set = (update['$set'] ?? {}) as Record<string, unknown>;
    for (const [path, value] of Object.entries(set)) {
      const key = path.replace('mfa.', '') as keyof UserMfa;
      (this.document.mfa[key] as unknown) = value;
    }
    const addToSet = (update['$addToSet'] ?? {}) as Record<string, MfaMethod>;
    for (const value of Object.values(addToSet)) {
      if (!this.document.mfa.methods.includes(value)) this.document.mfa.methods.push(value);
    }
    return this.document;
  }
}

function build(): { service: MfaService; users: FakeUserRepository; clock: ClockService } {
  const clock = new ClockService();
  clock.freezeAt(new Date('2026-02-01T12:00:00.000Z'));
  const config = new AppConfigService(testConfig());
  const users = new FakeUserRepository();
  const service = new MfaService(
    users as unknown as ConstructorParameters<typeof MfaService>[0],
    new TotpService(new SecretCipher(config), clock, config),
    new RecoveryCodeService(),
    clock,
  );
  return { service, users, clock };
}

async function enrol(service: MfaService, clock: ClockService): Promise<string> {
  const offer = await service.beginEnrolment(USER_ID);
  const epoch = Math.floor(clock.timestamp() / MILLISECONDS_PER_SECOND);
  const code = await generate({ secret: offer.secret, epoch });
  await service.confirmEnrolment(USER_ID, code);
  return offer.secret;
}

describe('MfaService enrolment', () => {
  it('stores the secret pending until a generated code confirms it', async () => {
    const { service, users } = build();

    await service.beginEnrolment(USER_ID);

    expect(users.document.mfa.totpSecret).not.toBeNull();
    expect(users.document.mfa.enrolled).toBe(false);
  });

  it('confirms with a valid code and records the spent time step', async () => {
    const { service, users } = build();

    await enrol(service, build().clock);

    expect(users.document.mfa.enrolled).toBe(true);
    expect(users.document.mfa.methods).toContain(MfaMethod.TOTP);
    expect(users.document.mfa.lastTimeStep).not.toBeNull();
  });

  it('rejects confirmation against a wrong code', async () => {
    const { service, clock } = build();
    const offer = await service.beginEnrolment(USER_ID);
    const epoch = Math.floor(clock.timestamp() / MILLISECONDS_PER_SECOND);
    const valid = await generate({ secret: offer.secret, epoch });
    const wrong = valid === '000000' ? '000001' : '000000';

    const failure = await service.confirmEnrolment(USER_ID, wrong).catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.MFA_INVALID_CODE);
    const { users } = build();
    expect(users.document.mfa.enrolled).toBe(false);
  });

  it('refuses to enrol twice', async () => {
    const { service, clock } = build();
    await enrol(service, clock);

    const failure = await service.beginEnrolment(USER_ID).catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.MFA_ALREADY_ENROLLED);
  });
});

describe('MfaService recovery codes and disable', () => {
  it('regenerates ten codes whose hashes replace the old set', async () => {
    const { service, users, clock } = build();
    await enrol(service, clock);

    const issue = await service.regenerateRecoveryCodes(USER_ID);

    expect(issue.codes).toHaveLength(10);
    expect(users.document.mfa.recoveryCodeHashes).toHaveLength(10);
    for (const hash of users.document.mfa.recoveryCodeHashes) {
      expect(issue.codes).not.toContain(hash);
    }
  });

  it('refuses recovery codes without an enrolment to recover', async () => {
    const { service } = build();

    const failure = await service.regenerateRecoveryCodes(USER_ID).catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.MFA_NOT_ENROLLED);
  });

  it('disable clears the secret, the codes and the TOTP method', async () => {
    const { service, users, clock } = build();
    await enrol(service, clock);
    await service.regenerateRecoveryCodes(USER_ID);

    await service.disable(USER_ID);

    expect(users.document.mfa.enrolled).toBe(false);
    expect(users.document.mfa.totpSecret).toBeNull();
    expect(users.document.mfa.recoveryCodeHashes).toEqual([]);
    expect(users.document.mfa.methods).not.toContain(MfaMethod.TOTP);
  });
});
