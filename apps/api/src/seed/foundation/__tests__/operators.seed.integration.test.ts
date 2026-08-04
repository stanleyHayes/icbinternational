import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Connection } from 'mongoose';
import { generate } from 'otplib';

import { Permission } from '@reliance/contracts';

import { ClockModule } from '../../../common/clock/clock.module.js';
import { ClockService } from '../../../common/clock/clock.service.js';
import { AppConfigModule } from '../../../config/config.module.js';
import { applyTestEnvironment } from '../../../modules/auth/__tests__/test-environment.js';
import { AdminLoginService } from '../../../modules/rbac/admin-login.service.js';
import { AdminUserService } from '../../../modules/rbac/admin-user.service.js';
import { ADMIN_USER_COLLECTION } from '../../../modules/rbac/rbac.constants.js';
import { RbacModule } from '../../../modules/rbac/rbac.module.js';
import { OPERATOR_PASSWORD, OPERATORS } from '../operators/operator-definitions.js';
import { OperatorsSeeder } from '../operators.seed.js';

/**
 * The operator seed, against the real replica set.
 *
 * Two things are worth proving and neither can be proved without a database. That the
 * seeder is idempotent — a salted password digest is different bytes every time, so a
 * seeder that compared stored to intended would rewrite the row on every deploy. And that
 * the credentials it *prints* actually open a session: a printed password nobody can sign
 * in with is worse than none, because it looks like the feature works.
 */

const DATABASE = 'reliancebank_operator_seed_test';
const MONGO_TIMEOUTS = { serverSelectionTimeoutMS: 120_000, connectTimeoutMS: 60_000 };
const MILLISECONDS_PER_SECOND = 1000;

jest.setTimeout(240_000);

let moduleRef: TestingModule;
let connection: Connection;
let seeder: OperatorsSeeder;
let logins: AdminLoginService;
let clock: ClockService;

beforeAll(async () => {
  const { uri } = applyTestEnvironment(DATABASE);

  moduleRef = await Test.createTestingModule({
    imports: [
      AppConfigModule,
      ClockModule,
      MongooseModule.forRoot(uri, { dbName: DATABASE, ...MONGO_TIMEOUTS }),
      RbacModule,
    ],
    providers: [OperatorsSeeder],
  }).compile();

  connection = moduleRef.get<Connection>(getConnectionToken());
  await connection.dropDatabase();

  seeder = moduleRef.get(OperatorsSeeder);
  logins = moduleRef.get(AdminLoginService);
  clock = moduleRef.get(ClockService);
  clock.freezeAt(clock.now());
}, 240_000);

afterAll(async () => {
  await connection?.dropDatabase();
  await moduleRef?.close();
});

describe('the operator seed', () => {
  it('provisions every operator on a clean database', async () => {
    const outcome = await seeder.run();

    expect(outcome.collection).toBe(ADMIN_USER_COLLECTION);
    expect(outcome.inserted).toBe(OPERATORS.length);
    expect(outcome.updated).toBe(0);
    await expect(connection.collection(ADMIN_USER_COLLECTION).countDocuments({})).resolves.toBe(
      OPERATORS.length,
    );
  });

  it('changes nothing on a second run', async () => {
    const outcome = await seeder.run();

    expect(outcome.inserted).toBe(0);
    expect(outcome.updated).toBe(0);
    expect(outcome.unchanged).toBe(OPERATORS.length);
  });

  it('prints credentials that actually open a session', async () => {
    for (const operator of OPERATORS) {
      // A fresh period per operator: one operator's code must not be the next one's replay.
      clock.advance(31_000);
      const epoch = Math.floor(clock.timestamp() / MILLISECONDS_PER_SECOND);

      const session = await logins.signIn({
        email: operator.email,
        password: OPERATOR_PASSWORD,
        totpCode: await generate({ secret: operator.totpSecret, epoch }),
        ip: '127.0.0.1',
      });

      expect(session.token.length).toBeGreaterThan(0);
      expect(session.admin.email).toBe(operator.email);
      expect(session.admin.mfaEnrolled).toBe(true);
    }
  });

  it('seeds a single administrator capable of full console access', async () => {
    const admins = moduleRef.get(AdminUserService);
    const [operator] = OPERATORS;
 
    const seeded = await admins.provisionIfAbsent({ ...operator!, password: OPERATOR_PASSWORD });
 
    expect(seeded.principal.email).toBe(operator!.email);
    expect(seeded.principal.roles).toEqual(operator!.roles);
    expect(seeded.principal.permissions).toContain(Permission.POSTING_APPROVE);
  });
});
