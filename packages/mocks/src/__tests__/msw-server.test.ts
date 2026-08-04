/**
 * End-to-end proof that the MSW adapter serves schema-valid data over real HTTP.
 *
 * The other suites drive resolvers directly, which cannot catch a broken adapter — a
 * handler MSW never matches, a body serialised wrongly, a header dropped. This suite
 * boots a real `setupServer`, points `fetch` at it, and parses what comes back against
 * the contract schemas, which is exactly what a UI lane's api-client will do.
 */

import { setupServer } from 'msw/node';
import { z } from 'zod';

import {
  accountSchema,
  apiErrorSchema,
  API_PREFIX,
  loginResultSchema,
  paginated,
  resource,
  routes,
  userSchema,
} from '@reliance/contracts';

import { db, resetMockDatabase } from '../db/database.js';
import { handlers } from '../msw-adapter.js';

const ORIGIN = 'https://api.reliance.test';

/** Any credential but the mock's one rejected value logs in. A fixture, not a secret. */
const ACCEPTED_CREDENTIAL = 'correct-horse-battery';

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => resetMockDatabase());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function url(contractPath: string): string {
  return `${ORIGIN}${API_PREFIX}${contractPath}`;
}

async function jsonOf(response: Response): Promise<unknown> {
  return (await response.json()) as unknown;
}

describe('the MSW server', () => {
  it('serves a schema-valid paginated list over HTTP', async () => {
    const response = await fetch(url(routes.accounts.list));

    expect(response.status).toBe(200);
    const parsed = paginated(accountSchema).safeParse(await jsonOf(response));
    expect(parsed.success).toBe(true);
  });

  it('serves a schema-valid single resource over HTTP', async () => {
    const response = await fetch(url(routes.auth.me));

    expect(response.status).toBe(200);
    const parsed = resource(userSchema).safeParse(await jsonOf(response));
    expect(parsed.success).toBe(true);
  });

  it('serves a schema-valid discriminated union over HTTP', async () => {
    const response = await fetch(url(routes.auth.login), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: db().currentUser.email,
        password: ACCEPTED_CREDENTIAL,
        deviceFingerprint: 'fp-0123456789',
      }),
    });

    expect(response.status).toBe(200);
    const parsed = resource(loginResultSchema).safeParse(await jsonOf(response));
    expect(parsed.success).toBe(true);
  });

  it('answers an unknown entity with the contract error envelope', async () => {
    const response = await fetch(url(routes.accounts.byId('acc_00000000000000000000000000')));

    expect(response.status).toBe(404);
    const parsed = apiErrorSchema.safeParse(await jsonOf(response));
    expect(parsed.success).toBe(true);
  });

  it('serves metrics as plain text, outside the JSON envelope', async () => {
    const response = await fetch(url(routes.system.metrics));

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
    expect(() => JSON.parse(body)).toThrow();
  });

  it('matches a parameterised path and extracts its parameter', async () => {
    const account = db().accounts[0];
    if (!account) throw new Error('seed produced no accounts');

    const response = await fetch(url(routes.accounts.byId(account.id)));

    expect(response.status).toBe(200);
    const parsed = resource(accountSchema).safeParse(await jsonOf(response));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.data.id).toBe(account.id);
  });

  it('replays the seeded balance the store holds, not a random one', async () => {
    const account = db().accounts[0];
    if (!account) throw new Error('seed produced no accounts');

    const response = await fetch(url(routes.accounts.balance(account.id)));
    const balanceSchema = z.object({
      data: z.object({ ledger: z.object({ amount: z.string() }) }),
    });
    const parsed = balanceSchema.safeParse(await jsonOf(response));

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.data.ledger.amount).toBe(account.balance.ledger.amount);
  });
});
