import { AdminRole, ErrorCode, Permission } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type PasswordService } from '../../auth/password.service.js';
import { type SecretCipher } from '../../auth/support/secret-cipher.js';
import { type AdminUserRepository } from '../admin-user.repository.js';
import { AdminUserService } from '../admin-user.service.js';
import { MAX_ALLOWLIST_ENTRIES } from '../rbac.constants.js';
import { type AdminUserDoc } from '../schemas/admin-user.schema.js';

const OFFICE_IP = '203.0.113.10';
const SECRET = 'KRSXG5CTMVRXEZLUFVZWK4TFOJZGK5DF';
// A fixture credential for an in-memory account, never a real one.
// eslint-disable-next-line sonarjs/no-hardcoded-passwords
const PASSWORD = 'Reliance-Operations-Console-2026';

/** The last document the fake repository was asked to create. */
let stored: Partial<AdminUserDoc>;
/** Every email the repository was asked about, so the absent-check can be asserted. */
let existing: AdminUserDoc | null = null;

const repository = {
  createAdmin: (input: Record<string, unknown>) => {
    stored = {
      active: true,
      grants: [],
      ipAllowlist: [],
      mfa: { totpSecret: null, enrolledAt: null, lastTimeStep: null },
      lastLoginAt: null,
      ...input,
    };
    return Promise.resolve(stored as AdminUserDoc);
  },
  findByPublicId: () => Promise.resolve(null),
  findByEmail: () => Promise.resolve(existing),
} as unknown as AdminUserRepository;

/** Recognisable stand-ins: the assertions are about *what* was transformed, not how. */
const passwords = {
  hash: (plaintext: string) => Promise.resolve(`argon2:${plaintext}`),
} as unknown as PasswordService;

const cipher = {
  seal: (plaintext: string) => `sealed:${plaintext}`,
} as unknown as SecretCipher;

const service = new AdminUserService(
  repository,
  new IdGenerator(),
  new ClockService(),
  passwords,
  cipher,
);

describe('AdminUserService.provision', () => {
  it('stores the email lowercased and mints an adm_ id', async () => {
    const principal = await service.provision({
      email: 'Mixed.Case@RelianceBank.example',
      fullName: 'Case Test',
      roles: [AdminRole.AUDITOR],
    });

    expect(stored.email).toBe('mixed.case@reliancebank.example');
    expect(principal.id.startsWith('adm_')).toBe(true);
  });

  it('resolves grants on top of the role bundle, de-duplicated', async () => {
    const principal = await service.provision({
      email: 'grants@reliancebank.example',
      fullName: 'Grant Test',
      roles: [AdminRole.SUPPORT_AGENT],
      grants: [Permission.REPORT_READ, Permission.TICKET_MANAGE],
    });

    expect(principal.permissions).toContain(Permission.REPORT_READ);
    expect(principal.permissions.filter((p) => p === Permission.TICKET_MANAGE)).toHaveLength(1);
  });

  it('rejects an oversized IP allowlist with a validation error', async () => {
    const ipAllowlist = Array.from({ length: MAX_ALLOWLIST_ENTRIES + 1 }, () => OFFICE_IP);

    let thrown: unknown;
    try {
      await service.provision({
        email: 'toomany@reliancebank.example',
        fullName: 'Too Many',
        roles: [AdminRole.AUDITOR],
        ipAllowlist,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('stores the password as a digest and the authenticator seed sealed', async () => {
    await service.provision({
      email: 'credentialled@reliancebank.example',
      fullName: 'Credentialled Officer',
      roles: [AdminRole.TREASURY],
      password: PASSWORD,
      totpSecret: SECRET,
    });

    expect(stored.passwordHash).toBe(`argon2:${PASSWORD}`);
    expect(stored.mfa?.totpSecret).toBe(`sealed:${SECRET}`);
    // Supplying a seed completes enrolment; the login path refuses an account without it.
    expect(stored.mfa?.enrolledAt).toBeInstanceOf(Date);
  });

  it('leaves an account with no credential rather than writing an empty one', async () => {
    await service.provision({
      email: 'not-yet@reliancebank.example',
      fullName: 'Awaiting Credentials',
      roles: [AdminRole.AUDITOR],
    });

    expect(stored.passwordHash).toBeUndefined();
    expect(stored.mfa?.totpSecret).toBeNull();
  });
});

describe('AdminUserService.provisionIfAbsent', () => {
  afterEach(() => {
    existing = null;
  });

  it('creates the account when the address is free', async () => {
    const outcome = await service.provisionIfAbsent({
      email: 'fresh@reliancebank.example',
      fullName: 'Fresh Operator',
      roles: [AdminRole.OPERATIONS],
      password: PASSWORD,
    });

    expect(outcome.created).toBe(true);
    expect(outcome.principal.email).toBe('fresh@reliancebank.example');
  });

  it('leaves an existing operator entirely alone', async () => {
    existing = {
      id: 'adm_01JBTESTEXISTINGOPERATOR1',
      email: 'taken@reliancebank.example',
      fullName: 'Existing Operator',
      roles: [AdminRole.TREASURY],
      grants: [],
      active: true,
      ipAllowlist: [],
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- a stand-in digest
      passwordHash: 'argon2:a-digest-of-whatever-they-chose-since',
    } as unknown as AdminUserDoc;

    const outcome = await service.provisionIfAbsent({
      email: 'Taken@RelianceBank.example',
      fullName: 'Existing Operator',
      roles: [AdminRole.TREASURY],
      password: PASSWORD,
    });

    // The point of the check: re-seeding must not overwrite a password its holder changed.
    expect(outcome.created).toBe(false);
    expect(outcome.principal.id).toBe('adm_01JBTESTEXISTINGOPERATOR1');
  });
});
