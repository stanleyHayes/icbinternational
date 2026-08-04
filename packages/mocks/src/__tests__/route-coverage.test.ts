/**
 * The test that stops the mocks drifting from the contract.
 *
 * It walks every leaf of the contract's `routes` map, builds a concrete path from it,
 * and asserts a registered handler matches. Add a route to `@reliance/contracts` without
 * adding a handler and this fails by name — which is the whole point. A mock package
 * that quietly covers 90% of the contract is a package that sends a UI lane down a road
 * that ends in a 404 three weeks later.
 */

import { API_PREFIX, routes } from '@reliance/contracts';

import { mockRoutes } from '../handlers/index.js';
import { matchPath } from '../handlers/match.js';

/** A sample value for each kind of path parameter the contract uses. */
const SAMPLES: Record<string, string> = {
  id: 'acc_01JQ8ZKX9M2NPQR3STVWXYZ456',
  slug: 'personal',
  key: 'passkeys',
  code: 'RB-CURRENT-PLUS',
  step: 'IDENTITY',
  accountId: 'acc_01JQ8ZKX9M2NPQR3STVWXYZ456',
  statementId: 'stm_01JQ8ZKX9M2NPQR3STVWXYZ456',
};

/** One contract route, resolved to a concrete path. */
interface ContractRoute {
  readonly group: string;
  readonly name: string;
  readonly path: string;
}

/**
 * Flattens `routes` into concrete paths.
 *
 * Function-valued entries are invoked with a sample per parameter. `Function.length`
 * gives the arity, so a two-parameter route such as `accounts.statement` gets two
 * samples rather than one and an `undefined`.
 */
function contractRoutes(): ContractRoute[] {
  const flattened: ContractRoute[] = [];

  for (const [group, entries] of Object.entries(routes)) {
    for (const [name, value] of Object.entries(entries as Record<string, unknown>)) {
      flattened.push({ group, name, path: resolvePath(name, value) });
    }
  }

  return flattened;
}

function resolvePath(name: string, value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'function') {
    throw new TypeError(`routes.${name} is neither a string nor a function.`);
  }

  const builder = value as (...args: string[]) => string;
  const args = SAMPLE_ORDER[name] ?? Array.from({ length: builder.length }, () => SAMPLES.id ?? '');
  return builder(...args);
}

/** Parameter samples for the routes whose parameters are not plain ids. */
const SAMPLE_ORDER: Record<string, string[]> = {
  page: ['personal'],
  post: ['how-to-save'],
  slug: ['personal'],
  step: ['IDENTITY'],
  flag: ['passkeys'],
  product: ['RB-CURRENT-PLUS'],
  statement: [SAMPLES.accountId ?? '', SAMPLES.statementId ?? ''],
};

describe('route coverage', () => {
  const contract = contractRoutes();

  it('finds every contract route in the map', () => {
    // Guards the walker itself: a broken flattener that returned nothing would make
    // every other assertion in this file pass vacuously.
    expect(contract.length).toBeGreaterThan(200);
  });

  it.each(contract.map((entry) => [`${entry.group}.${entry.name}`, entry.path] as const))(
    'has a handler for %s (%s)',
    (_label, contractPath) => {
      const concrete = `${API_PREFIX}${contractPath}`;
      const matched = mockRoutes.filter((mockRoute) => matchPath(mockRoute.path, concrete));

      expect(matched.length).toBeGreaterThan(0);
    },
  );

  it('registers no duplicate method-and-path pairs', () => {
    const seen = new Map<string, number>();

    for (const mockRoute of mockRoutes) {
      const key = `${mockRoute.method} ${mockRoute.path}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
    expect(duplicates).toEqual([]);
  });

  it('prefixes every handler path with the wildcard and the API version', () => {
    for (const mockRoute of mockRoutes) {
      expect(mockRoute.path.startsWith(`*${API_PREFIX}/`)).toBe(true);
    }
  });

  /**
   * Static paths must win over parameterised siblings.
   *
   * MSW takes the first matching handler, so `/accounts/net-worth` registered after
   * `/accounts/:id` would resolve to "the account whose id is net-worth" and 404. This
   * asserts the ordering rather than trusting a comment about it.
   */
  it.each([
    ['/accounts/net-worth', routes.accounts.netWorth],
    ['/accounts/letters', routes.accounts.letters],
    ['/deposits/rates', routes.save.depositRates],
    ['/payment-requests/split', routes.payments.splitBill],
    ['/sessions/revoke-all', routes.devices.revokeAllSessions],
    ['/beneficiaries/verify-name', routes.beneficiaries.verifyName],
    ['/loans/products', routes.borrow.products],
    ['/transactions/export', routes.transactions.export],
    ['/notifications/read', routes.notifications.markRead],
    ['/admin/audit/verify', routes.admin.verifyAuditChain],
  ])('resolves the static path %s to its own handler', (_label, contractPath) => {
    const concrete = `${API_PREFIX}${contractPath}`;
    const first = mockRoutes.find((mockRoute) => matchPath(mockRoute.path, concrete));

    expect(first?.contractPath).toBe(contractPath);
  });

  it('does not leave the simulation routes shadowed by the admin routes', () => {
    const concrete = `${API_PREFIX}${routes.simulation.state}`;
    const first = mockRoutes.find((mockRoute) => matchPath(mockRoute.path, concrete));

    expect(first?.contractPath).toBe(routes.simulation.state);
  });
});

describe('matchPath', () => {
  it('matches a parameterised pattern against a concrete path', () => {
    expect(matchPath('*/v1/accounts/:id', '/v1/accounts/acc_123')).toBe(true);
    expect(matchPath('*/v1/accounts/:id', 'https://api.test/v1/accounts/acc_123')).toBe(true);
  });

  it('ignores a query string', () => {
    expect(matchPath('*/v1/accounts', '/v1/accounts?limit=25')).toBe(true);
  });

  it('rejects a path with a different segment count', () => {
    expect(matchPath('*/v1/accounts/:id', '/v1/accounts')).toBe(false);
    expect(matchPath('*/v1/accounts', '/v1/accounts/acc_123')).toBe(false);
  });

  it('rejects a literal segment that differs', () => {
    expect(matchPath('*/v1/accounts/net-worth', '/v1/accounts/acc_123')).toBe(false);
  });
});
