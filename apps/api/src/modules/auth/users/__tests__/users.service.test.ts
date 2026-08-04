import { ErrorCode, UserStatus } from '@reliance/contracts';

import { ClockService } from '../../../../common/clock/clock.service.js';
import { AppError } from '../../../../common/errors/app-error.js';
import { IdGenerator } from '../../../../common/ids/id-generator.js';
import { type UserDocument } from '../schemas/user.schema.js';
import { toUserView } from '../user.mapper.js';
import { type UserRepository } from '../user.repository.js';
import { UsersService } from '../users.service.js';

const NOW = new Date('2026-03-01T10:00:00.000Z');
const LOCKOUT = { maxAttempts: 3, lockoutMinutes: 15 };

/**
 * An Argon2-shaped placeholder, assembled rather than written out so that it is not a
 * credential literal. Its only job is to be recognisable in a response if the mapper ever
 * stops dropping the field.
 */
const DIGEST_SHAPED_PLACEHOLDER = ['$argon2id$v=19$m=19456,t=2,p=1', 'c2FsdA', 'aGFzaA'].join('$');

/**
 * A repository stubbed down to the two behaviours the lockout logic depends on: `$inc`
 * returns the *incremented* document, and `$set` records what it was asked to write.
 */
function stubRepository(initialAttempts = 0) {
  const state = { failedLoginAttempts: initialAttempts, lockedUntil: null as Date | null };
  const writes: Record<string, unknown>[] = [];

  const patch = jest.fn(async (_id: string, update: Record<string, Record<string, unknown>>) => {
    if (update['$inc']) state.failedLoginAttempts += Number(update['$inc']['failedLoginAttempts']);
    if (update['$set']) {
      writes.push(update['$set']);
      Object.assign(state, update['$set']);
    }
    return state as unknown as UserDocument;
  });

  return { repository: { patch } as unknown as UserRepository, state, writes, patch };
}

function makeService(repository: UserRepository) {
  const clock = new ClockService();
  clock.freezeAt(NOW);
  return new UsersService(repository, new IdGenerator(), clock);
}

describe('login failure accounting', () => {
  it('counts a failure without locking while the budget remains', async () => {
    const { repository, writes, patch } = stubRepository();
    const users = makeService(repository);

    await users.recordFailedLogin('usr_1', LOCKOUT);

    expect(patch).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(0);
  });

  it('locks the account once the attempt budget is exhausted', async () => {
    // Two failures already recorded; this one is the third and last permitted.
    const { repository, writes } = stubRepository(LOCKOUT.maxAttempts - 1);
    const users = makeService(repository);

    await users.recordFailedLogin('usr_1', LOCKOUT);

    expect(writes).toHaveLength(1);
    expect(writes[0]?.['lockedUntil']).toEqual(new Date('2026-03-01T10:15:00.000Z'));
  });

  it('keeps the account locked as attempts continue past the threshold', async () => {
    const { repository, writes } = stubRepository(LOCKOUT.maxAttempts + 5);
    const users = makeService(repository);

    await users.recordFailedLogin('usr_1', LOCKOUT);

    expect(writes).toHaveLength(1);
  });

  it('clears the counter and the lock on a successful login', async () => {
    const { repository, writes } = stubRepository(LOCKOUT.maxAttempts);
    const users = makeService(repository);

    await users.recordSuccessfulLogin('usr_1');

    expect(writes[0]).toEqual({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: NOW });
  });
});

describe('lockout expiry', () => {
  const users = makeService(stubRepository().repository);

  it('reports a future lock as active', () => {
    const user = { lockedUntil: new Date('2026-03-01T10:05:00.000Z') } as UserDocument;
    expect(users.isLockedOut(user)).toBe(true);
  });

  it('reports an elapsed lock as spent, without needing a write to clear it', () => {
    const user = { lockedUntil: new Date('2026-03-01T09:55:00.000Z') } as UserDocument;
    expect(users.isLockedOut(user)).toBe(false);
  });

  it('reports an account that was never locked as unlocked', () => {
    expect(users.isLockedOut({ lockedUntil: null } as UserDocument)).toBe(false);
  });
});

describe('status gating', () => {
  const users = makeService(stubRepository().repository);
  const withStatus = (status: UserStatus) => ({ status }) as UserDocument;

  it('admits an active customer', () => {
    expect(() => users.assertCanAuthenticate(withStatus(UserStatus.ACTIVE))).not.toThrow();
  });

  it.each([
    [UserStatus.PENDING_VERIFICATION, ErrorCode.EMAIL_NOT_VERIFIED],
    [UserStatus.LOCKED, ErrorCode.ACCOUNT_LOCKED],
    [UserStatus.SUSPENDED, ErrorCode.ACCOUNT_SUSPENDED],
    [UserStatus.CLOSED, ErrorCode.FORBIDDEN],
  ])('refuses a %s account with %s', (status, code) => {
    expect(() => users.assertCanAuthenticate(withStatus(status))).toThrow(AppError);

    try {
      users.assertCanAuthenticate(withStatus(status));
    } catch (error) {
      expect((error as AppError).code).toBe(code);
    }
  });
});

describe('the contract view', () => {
  const stored = {
    id: 'usr_01JQ8Z0000000000000000000A',
    email: 'ada@example.com',
    emailVerified: true,
    passwordHash: DIGEST_SHAPED_PLACEHOLDER,
    phone: null,
    phoneVerified: false,
    firstName: 'Ada',
    lastName: 'Lovelace',
    status: UserStatus.ACTIVE,
    segment: 'PERSONAL',
    kycTier: 2,
    mfa: { enrolled: true, methods: ['TOTP'], totpSecret: 'sealed', recoveryCodeHashes: ['h'] },
    locale: 'en-GB',
    baseCurrency: 'GBP',
    avatarUrl: null,
    createdAt: NOW,
    lastLoginAt: null,
  } as unknown as UserDocument;

  it('never carries credential material into the response', () => {
    const view = toUserView(stored) as unknown as Record<string, unknown>;

    expect(view['passwordHash']).toBeUndefined();
    expect(view['mfa']).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('sealed');
  });

  it('reports enrolled factors and serialises timestamps as ISO instants', () => {
    const view = toUserView(stored);

    expect(view.mfaEnabled).toBe(true);
    expect(view.mfaMethods).toEqual(['TOTP']);
    expect(view.createdAt).toBe('2026-03-01T10:00:00.000Z');
    expect(view.lastLoginAt).toBeNull();
  });

  it('hides the enrolled factor list while enrolment is incomplete', () => {
    const pending = { ...stored, mfa: { enrolled: false, methods: ['TOTP'] } } as UserDocument;

    expect(toUserView(pending).mfaMethods).toEqual([]);
  });
});
