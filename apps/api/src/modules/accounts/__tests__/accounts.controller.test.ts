import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';

import { routes } from '@reliance/contracts';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { type AccountClosureService } from '../account-closure.service.js';
import { type AccountOpeningService } from '../account-opening.service.js';
import { type AccountService } from '../account.service.js';
import { AccountsController } from '../accounts.controller.js';
import { type NetWorthService } from '../net-worth.service.js';

import { OTHER_USER, TEST_USER } from './accounts-harness.js';

const ACCOUNT_ID = 'acc_01JQ8Z00000000000000000000';

/**
 * The controller's own job is small and entirely about identity: take the caller from the
 * verified token, never from the request, and hand it to the service that resolves the
 * account through it. These tests pin that down, because it is the one place an IDOR
 * could be reintroduced by a well-meaning refactor that "simplified" a handler.
 */
function rig() {
  const calls: Array<{ method: string; userId: string; accountId?: string }> = [];

  const accounts = {
    list: async (userId: string) => {
      calls.push({ method: 'list', userId });
      return [];
    },
    get: async (userId: string, accountId: string) => {
      calls.push({ method: 'get', userId, accountId });
      return {};
    },
    balance: async (userId: string, accountId: string) => {
      calls.push({ method: 'balance', userId, accountId });
      return {};
    },
    update: async (userId: string, accountId: string) => {
      calls.push({ method: 'update', userId, accountId });
      return {};
    },
  } as unknown as AccountService;

  const opening = {
    open: async (input: { userId: string }) => {
      calls.push({ method: 'open', userId: input.userId });
      return {};
    },
  } as unknown as AccountOpeningService;

  const closure = {
    close: async (input: { userId: string; accountId: string }) => {
      calls.push({ method: 'close', userId: input.userId, accountId: input.accountId });
      return {};
    },
  } as unknown as AccountClosureService;

  const netWorth = {
    forUser: async (userId: string) => {
      calls.push({ method: 'netWorth', userId });
      return {};
    },
  } as unknown as NetWorthService;

  return { calls, controller: new AccountsController(accounts, opening, closure, netWorth) };
}

const caller = { userId: TEST_USER, sessionId: 'ses_1', deviceId: null };

describe('AccountsController', () => {
  it('is guarded, so no handler is reachable without a verified token', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, AccountsController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('registers net worth on its own path, not as an account id', () => {
    const path: string = Reflect.getMetadata(PATH_METADATA, AccountsController.prototype.worth);
    expect(path).toBe(routes.accounts.netWorth);
    expect(path).not.toContain(':');
  });

  it.each([
    ['get', (rigged: ReturnType<typeof rig>) => rigged.controller.get(caller, ACCOUNT_ID)],
    ['balance', (rigged: ReturnType<typeof rig>) => rigged.controller.balance(caller, ACCOUNT_ID)],
    [
      'update',
      (rigged: ReturnType<typeof rig>) => rigged.controller.update(caller, ACCOUNT_ID, {}),
    ],
    [
      'close',
      (rigged: ReturnType<typeof rig>) =>
        rigged.controller.close(caller, ACCOUNT_ID, { reason: 'Done' }),
    ],
  ])('resolves %s through the token identity, never the path', async (method, invoke) => {
    const rigged = rig();
    await invoke(rigged);

    expect(rigged.calls).toEqual([{ method, userId: TEST_USER, accountId: ACCOUNT_ID }]);
  });

  it('never lets a handler substitute another identity', async () => {
    const rigged = rig();
    await rigged.controller.list({ ...caller, userId: OTHER_USER }, {});

    expect(rigged.calls[0]?.userId).toBe(OTHER_USER);
  });

  it('opens and reports net worth for the caller only', async () => {
    const rigged = rig();
    await rigged.controller.open(caller, {
      productCode: 'EVERYDAY_CURRENT',
      currency: 'GBP',
      additionalHolderEmails: [],
    });
    await rigged.controller.worth(caller);

    expect(rigged.calls.map((call) => call.userId)).toEqual([TEST_USER, TEST_USER]);
  });
});
