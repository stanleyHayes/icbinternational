import { JwtService } from '@nestjs/jwt';

import { ErrorCode } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { AppConfigService } from '../../../config/config.service.js';
import { TokenService } from '../token.service.js';

import { testConfig } from './test-environment.js';

const SESSION_ID = 'ses_01JRYE1M3PXWN9XW9C5T3N8PC2';

function makeService(clock: ClockService = new ClockService()): TokenService {
  return new TokenService(new JwtService(), new AppConfigService(testConfig()), clock);
}

async function codeOf(action: () => Promise<unknown>): Promise<ErrorCode> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  throw new Error('expected the action to throw an AppError');
}

jest.setTimeout(120_000);

describe('TokenService', () => {
  it('round-trips an access token with its claims', async () => {
    const service = makeService();
    const token = await service.signAccess({
      userId: 'usr_01JRYE1M3PXWN9XW9C5T3N8PC2',
      sessionId: SESSION_ID,
      deviceId: null,
    });

    const claims = await service.verifyAccess(token);
    expect(claims.sid).toBe(SESSION_ID);
    expect(claims.typ).toBe('access');
  });

  it('refuses a token presented for the wrong purpose', async () => {
    const service = makeService();
    const refresh = await service.signRefresh({
      userId: 'usr_01JRYE1M3PXWN9XW9C5T3N8PC2',
      sessionId: SESSION_ID,
      family: SESSION_ID,
    });

    expect(await codeOf(() => service.verifyAccess(refresh))).toBe(ErrorCode.TOKEN_INVALID);
  });

  it('refuses a token verified under the wrong secret', async () => {
    const service = makeService();
    const access = await service.signAccess({
      userId: 'usr_01JRYE1M3PXWN9XW9C5T3N8PC2',
      sessionId: SESSION_ID,
      deviceId: null,
    });

    expect(await codeOf(() => service.verifyRefresh(access))).toBe(ErrorCode.TOKEN_INVALID);
  });

  it('distinguishes expiry from every other failure', async () => {
    const clock = new ClockService();
    const service = makeService(clock);
    const token = await service.signAccess({
      userId: 'usr_01JRYE1M3PXWN9XW9C5T3N8PC2',
      sessionId: SESSION_ID,
      deviceId: null,
    });

    // The simulated clock jumping past the TTL is what expires tokens — not the wall clock.
    clock.advance(20 * 60 * 1000);

    expect(await codeOf(() => service.verifyAccess(token))).toBe(ErrorCode.TOKEN_EXPIRED);
  });

  it('refuses a garbled token as invalid, not expired', async () => {
    const service = makeService();

    expect(await codeOf(() => service.verifyAccess('not-a-jwt'))).toBe(ErrorCode.TOKEN_INVALID);
  });
});
