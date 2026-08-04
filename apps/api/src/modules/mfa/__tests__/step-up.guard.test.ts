import { type ExecutionContext } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';

import { ErrorCode, STEP_UP_HEADER } from '@reliance/contracts';

import { AppError } from '../../../common/errors/app-error.js';
import {
  type AuthenticatedRequest,
  type StepUpClaims,
  TokenPurpose,
} from '../../auth/auth.types.js';
import { type TokenService } from '../../auth/token.service.js';
import { StepUpGuard } from '../step-up.guard.js';

const USER_ID = 'usr_01HZY0M4V0D2T0FH0GN3J1Q0AA';
const OTHER_USER_ID = 'usr_01HZY1N8W1E3U1GI1HP4K2R1BB';

/** A TokenService double whose verifyStepUp behaviour each test scripts. */
type VerifyStepUp = (token: string) => Promise<StepUpClaims>;

function claimsFor(sub: string): StepUpClaims {
  return { sub, typ: TokenPurpose.STEP_UP, jti: 'jti', iat: 0, exp: 0 };
}

function contextWith(request: Partial<AuthenticatedRequest>): ExecutionContext {
  // The guard reads metadata off both the handler and the class before it touches the
  // request, so a stub that only implements switchToHttp throws before the assertion
  // under test is ever reached.
  const handler = function route() {};
  return {
    getHandler: () => handler,
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildGuard(required: boolean, verifyStepUp: VerifyStepUp): StepUpGuard {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const tokens = { verifyStepUp } as unknown as TokenService;
  return new StepUpGuard(reflector, tokens);
}

function requestWith(headers: Record<string, string>): Partial<AuthenticatedRequest> {
  return {
    user: { userId: USER_ID, sessionId: 'ses_x', deviceId: null },
    headers,
  } as Partial<AuthenticatedRequest>;
}

describe('StepUpGuard', () => {
  it('passes routes that never asked for step-up', async () => {
    const guard = buildGuard(false, () => Promise.reject(new Error('must not be called')));
    await expect(guard.canActivate(contextWith({}))).resolves.toBe(true);
  });

  it('rejects a missing proof with STEP_UP_REQUIRED', async () => {
    const guard = buildGuard(true, () => Promise.reject(new Error('must not be called')));

    const failure = await guard
      .canActivate(contextWith(requestWith({})))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).code).toBe(ErrorCode.STEP_UP_REQUIRED);
  });

  it('accepts a fresh proof minted for the caller', async () => {
    const guard = buildGuard(true, (token) => {
      expect(token).toBe('proof');
      return Promise.resolve(claimsFor(USER_ID));
    });

    await expect(
      guard.canActivate(contextWith(requestWith({ [STEP_UP_HEADER]: 'proof' }))),
    ).resolves.toBe(true);
  });

  it('rejects a proof minted for someone else', async () => {
    const guard = buildGuard(true, () => Promise.resolve(claimsFor(OTHER_USER_ID)));

    const failure = await guard
      .canActivate(contextWith(requestWith({ [STEP_UP_HEADER]: 'proof' })))
      .catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.STEP_UP_REQUIRED);
  });

  it('rejects an expired proof as STEP_UP_REQUIRED, not as a token error', async () => {
    const guard = buildGuard(true, () =>
      Promise.reject(new AppError({ code: ErrorCode.TOKEN_EXPIRED, message: 'expired' })),
    );

    const failure = await guard
      .canActivate(contextWith(requestWith({ [STEP_UP_HEADER]: 'proof' })))
      .catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.STEP_UP_REQUIRED);
  });

  it('rejects a forged proof with the same answer as a missing one', async () => {
    const guard = buildGuard(true, () =>
      Promise.reject(new AppError({ code: ErrorCode.TOKEN_INVALID, message: 'forged' })),
    );

    const failure = await guard
      .canActivate(contextWith(requestWith({ [STEP_UP_HEADER]: 'proof' })))
      .catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.STEP_UP_REQUIRED);
  });

  it('refuses to run without an authenticated identity on the request', async () => {
    const guard = buildGuard(true, () => Promise.resolve(claimsFor(USER_ID)));

    const failure = await guard
      .canActivate(contextWith({ headers: { [STEP_UP_HEADER]: 'proof' } }))
      .catch((error: unknown) => error);

    expect((failure as AppError).code).toBe(ErrorCode.UNAUTHENTICATED);
  });
});
