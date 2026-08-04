import { AdminRole, ErrorCode, Permission } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type AdminUserRepository } from '../admin-user.repository.js';
import { AdminUserService } from '../admin-user.service.js';
import { MAX_ALLOWLIST_ENTRIES } from '../rbac.constants.js';
import { type AdminUserDoc } from '../schemas/admin-user.schema.js';

const OFFICE_IP = '203.0.113.10';

/** The last document the fake repository was asked to create. */
let stored: Partial<AdminUserDoc>;

const repository = {
  createAdmin: (input: Record<string, unknown>) => {
    stored = {
      active: true,
      grants: [],
      ipAllowlist: [],
      mfa: { totpSecret: null, enrolledAt: null },
      lastLoginAt: null,
      ...input,
    };
    return Promise.resolve(stored as AdminUserDoc);
  },
  findByPublicId: () => Promise.resolve(null),
} as unknown as AdminUserRepository;

const service = new AdminUserService(repository, new IdGenerator(), new ClockService());

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
});
