import { Injectable } from '@nestjs/common';

import { AdminUserService } from '../../modules/rbac/index.js';
import { ADMIN_USER_COLLECTION } from '../../modules/rbac/rbac.constants.js';
import { type SeedOutcome, type Seeder } from '../seed.types.js';

import { OPERATOR_PASSWORD, OPERATORS } from './operators/operator-definitions.js';

/** Where the operations console runs locally. Matches `apps/web-admin`'s dev port. */
const CONSOLE_URL = 'http://localhost:3002';

/**
 * Seeds the operators who can actually sign into the console.
 *
 * Reference data, in the same sense the chart of accounts is: without it thirty-five admin
 * routes sit behind a token nothing can issue, and every back-office screen is unreachable.
 *
 * An adapter, not a second writer. `AdminUserService` owns the `admin_users` collection,
 * the Argon2 hashing and the sealing of the authenticator seed; this translates its result
 * into the `SeedOutcome` the summary reports in. That delegation is also what makes the
 * seeder idempotent — see `provisionIfAbsent`, which will not re-hash a password that has
 * already been set, because a salted digest never compares equal to itself.
 */
@Injectable()
export class OperatorsSeeder implements Seeder {
  readonly name = 'operators';

  constructor(private readonly admins: AdminUserService) {}

  async run(): Promise<SeedOutcome> {
    let inserted = 0;

    for (const operator of OPERATORS) {
      const outcome = await this.admins.provisionIfAbsent({
        email: operator.email,
        fullName: operator.fullName,
        roles: operator.roles,
        password: OPERATOR_PASSWORD,
        totpSecret: operator.totpSecret,
      });

      if (outcome.created) inserted += 1;
    }

    // Printed on every run, not only the first: a developer who reseeds an existing
    // database still needs to know how to get in, and these credentials exist to be used.
    process.stdout.write(formatOperatorCredentials());

    return {
      collection: ADMIN_USER_COLLECTION,
      inserted,
      // Nothing is ever rewritten. An operator who changed their password since the last
      // run keeps it, and re-asserting the seeded one would quietly undo that.
      updated: 0,
      unchanged: OPERATORS.length - inserted,
    };
  }
}

/**
 * The block printed at the end of the seed. Terminal only — never a screen.
 *
 * The authenticator key is printed because staff sign-in has no password-only path: the
 * password alone opens nothing, so an operator's key is as much a part of "how to sign in"
 * as their address is.
 */
export function formatOperatorCredentials(): string {
  const lines = [
    '',
    '  The operations console is ready.',
    '',
    `  Sign in at ${CONSOLE_URL} with the password: ${OPERATOR_PASSWORD}`,
    '  Each operator needs their authenticator key entered into an authenticator app.',
    '',
  ];

  for (const operator of OPERATORS) {
    lines.push(`  ${operator.email}`);
    lines.push(`    ${operator.fullName} — ${operator.remit}`);
    lines.push(`    Authenticator key: ${operator.totpSecret}`);
    lines.push('');
  }

  return lines.join('\n');
}
