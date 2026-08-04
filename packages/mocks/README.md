# `@reliance/mocks`

A **stateful** mock of the Reliance Bank API. Every route in the contract's `routes` map has a
handler, and a test asserts it.

## Why stateful

A mock that returns fresh random data on every call is worse than no mock at all: it teaches the UI
that the bank's own numbers need not agree with each other, and every screen built against it grows
defences against states the real API will never produce.

So these mocks are coherent. Creating a transfer, in one call:

- debits the source account,
- appends a row to the top of the transaction feed with the correct running balance,
- records the transfer with a full status timeline,
- raises a notification.

Likewise: contributing to a goal costs real money, breaking a deposit applies the penalty the quote
disclosed, a lost dispute reverses its provisional credit, freezing a card changes its status _and_
tells the customer, and advancing the simulation clock moves every maturity date in the fixture set.

## Getting started

```ts
// Browser (Next.js)
if (process.env.NEXT_PUBLIC_API_MOCKING === 'enabled') {
  const { browserWorker } = await import('@reliance/mocks/browser');
  await browserWorker.start({ onUnhandledRequest: 'bypass' });
}
```

```ts
// Node / Jest
import { server } from '@reliance/mocks/server';
import { resetMockDatabase } from '@reliance/mocks';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => resetMockDatabase());
afterAll(() => server.close());
```

Handlers match `*/v1/...`, so the same set works against `http://localhost:3000` and
`https://api.reliance.test` without configuring a base URL twice.

## Seeding

Fixtures are deterministic. `resetMockDatabase(1234)` reproduces exactly the same bank every time,
which is what lets a screenshot test compare like with like.

```ts
const database = resetMockDatabase(1234);
database.accounts[0].balance.ledger; // identical on every run
```

Call `resetMockDatabase()` in a `beforeEach`. A suite that mutates the mocks without resetting is a
suite whose tests pass in one order and fail in another.

## Reaching a specific state

Deterministic switches, so a lane can build an edge case on demand rather than waiting for a random
one:

| To get                      | Do this                                          |
| --------------------------- | ------------------------------------------------ |
| The MFA challenge           | Log in with an email containing `mfa`            |
| A locked account            | Log in with an email containing `locked`         |
| Invalid credentials         | Log in with the password `wrong-password`        |
| An invalid MFA code         | Verify with `000000`                             |
| A close-match payee warning | Verify a name containing `close`                 |
| `INSUFFICIENT_FUNDS`        | Quote a transfer larger than the balance         |
| `STEP_UP_REQUIRED`          | Call `cards.sensitive` with no `x-step-up-token` |
| `IDEMPOTENCY_KEY_REQUIRED`  | Create a transfer with no `Idempotency-Key`      |

Anything else: reach into the store directly. `db()` returns the live object and handlers read it on
the next request.

```ts
import { db } from '@reliance/mocks';
db().accounts[0].status = 'FROZEN';
```

## Factories

Every fixture builder is exported, for component tests that do not need the whole bank:

```ts
import { makeAccount, makeCard, makeTransaction, mockClock } from '@reliance/mocks';

const account = makeAccount({ clock: mockClock(), userId: 'usr_…' });
const card = makeCard({
  clock: mockClock(),
  accountId: account.id,
  cardholderName: 'Ada Lovelace',
  overrides: { status: 'FROZEN' },
});
```

`overrides` merges last, so pin the one field the test is about and let the factory fill the rest.
Where a field is _derived_ from an override — a location's `kind` decides its services — the factory
recomputes rather than letting the spread produce a fixture that contradicts itself.

## Architecture

MSW appears in exactly one file. Handlers are plain descriptors:

```
{ method, path, contractPath, resolve(context) → { status, body } }
```

`msw-adapter.ts` turns them into MSW handlers. Three things follow: the route-coverage test walks
the descriptors without booting a service worker, a resolver is an ordinary function that can be
unit-tested with a plain object, and swapping MSW out is a change to one file.

## The tests that matter

- **`route-coverage.test.ts`** — walks every leaf of the contract's `routes` map and asserts a
  handler matches. Add a route to `@reliance/contracts` without adding a handler here and it fails
  by name. It also asserts that static paths are registered before the parameterised siblings that
  would otherwise swallow them; it has already caught one.
- **`schema-validity.test.ts`** — parses every fixture against its contract schema, across several
  seeds. `@reliance/api-client` validates responses against those same schemas in development, so a
  fixture that does not parse would reach a UI lane as a baffling `INTERNAL_ERROR` from their own
  mock.
- **`coherence.test.ts`** — proves the mocks agree with themselves.
