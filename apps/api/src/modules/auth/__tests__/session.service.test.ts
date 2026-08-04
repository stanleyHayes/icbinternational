import { JwtService } from '@nestjs/jwt';
import mongoose, { type Connection, type Model } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { AppConfigService } from '../../../config/config.service.js';
import { SessionRevocation } from '../auth.constants.js';
import { Session, SessionSchema } from '../schemas/session.schema.js';
import { SessionRepository } from '../session.repository.js';
import { SessionService } from '../session.service.js';
import { TokenService } from '../token.service.js';

import { applyTestEnvironment, TEST_MONGO_URI, testConfig } from './test-environment.js';

jest.setTimeout(600_000);

const DB_NAME = 'auth_test_session_service';
const ORIGIN = { ip: '127.0.0.1', userAgent: 'jest' };

let connection: Connection;
let model: Model<Session>;
let service: SessionService;
let tokens: TokenService;
let ids: IdGenerator;

beforeAll(async () => {
  applyTestEnvironment(DB_NAME);
  connection = await mongoose
    .createConnection(TEST_MONGO_URI, {
      dbName: DB_NAME,
      serverSelectionTimeoutMS: 120_000,
      connectTimeoutMS: 60_000,
    })
    .asPromise();
  model = connection.model(Session.name, SessionSchema);
  await connection.dropDatabase();
  await model.ensureIndexes();

  const clock = new ClockService();
  ids = new IdGenerator();
  tokens = new TokenService(new JwtService(), new AppConfigService(testConfig()), clock);
  service = new SessionService(new SessionRepository(model), tokens, ids, clock);
});

afterAll(async () => {
  await connection.dropDatabase();
  await connection.close();
});

async function codeOf(action: () => Promise<unknown>): Promise<ErrorCode> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  throw new Error('expected the action to throw an AppError');
}

function familyRows(family: string) {
  return model.find({ family }).lean().exec();
}

describe('SessionService rotation', () => {
  it('mints a session and rotates its refresh token into a successor', async () => {
    const userId = ids.generate('user');
    const first = await service.create(userId, null, ORIGIN);
    const second = await service.rotate(first.refreshToken, ORIGIN);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.session.family).toBe(first.session.id);
    await expect(service.isLive(second.session.id)).resolves.toBe(true);
    await expect(service.isLive(first.session.id)).resolves.toBe(false);
  });

  it('revokes the whole family when a spent token is presented again', async () => {
    const userId = ids.generate('user');
    const first = await service.create(userId, null, ORIGIN);
    const second = await service.rotate(first.refreshToken, ORIGIN);

    // The thief replays the token the honest client just rotated away.
    expect(await codeOf(() => service.rotate(first.refreshToken, ORIGIN))).toBe(
      ErrorCode.TOKEN_REUSE_DETECTED,
    );

    const rows = await familyRows(first.session.family);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.revokedAt).not.toBeNull();
      expect(row.revokedReason).toBe(SessionRevocation.REUSE_DETECTED);
    }

    // And the family revocation is real: the newest, still-unspent token is dead too.
    expect(await codeOf(() => service.rotate(second.refreshToken, ORIGIN))).toBe(
      ErrorCode.TOKEN_INVALID,
    );
  });

  it('refuses a well-formed token that has no session row', async () => {
    const forged = await tokens.signRefresh({
      userId: ids.generate('user'),
      sessionId: ids.generate('session'),
      family: ids.generate('session'),
    });

    expect(await codeOf(() => service.rotate(forged, ORIGIN))).toBe(ErrorCode.TOKEN_INVALID);
  });

  it('refuses a token from a signed-out session as invalid, without touching the family', async () => {
    const userId = ids.generate('user');
    const bundle = await service.create(userId, null, ORIGIN);
    await service.revoke(bundle.session.id, SessionRevocation.LOGGED_OUT);

    expect(await codeOf(() => service.rotate(bundle.refreshToken, ORIGIN))).toBe(
      ErrorCode.TOKEN_INVALID,
    );

    const row = await model.findOne({ id: bundle.session.id }).lean().exec();
    expect(row?.revokedReason).toBe(SessionRevocation.LOGGED_OUT);
  });

  it('refuses a token whose session row has expired', async () => {
    const userId = ids.generate('user');
    const bundle = await service.create(userId, null, ORIGIN);
    await model.updateOne(
      { id: bundle.session.id },
      { $set: { expiresAt: new Date('2020-01-01T00:00:00.000Z') } },
    );

    expect(await codeOf(() => service.rotate(bundle.refreshToken, ORIGIN))).toBe(
      ErrorCode.TOKEN_EXPIRED,
    );
  });

  it('revokes every session but the one spared by a password change', async () => {
    const userId = ids.generate('user');
    const kept = await service.create(userId, null, ORIGIN);
    const dropped = await service.create(userId, null, ORIGIN);

    await service.revokeAllForUser(userId, SessionRevocation.PASSWORD_CHANGED, kept.session.id);

    await expect(service.isLive(kept.session.id)).resolves.toBe(true);
    await expect(service.isLive(dropped.session.id)).resolves.toBe(false);
  });
});
