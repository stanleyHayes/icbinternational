# @reliance/testing

Test harness for Reliance Bank: seeded faker, contract-valid data builders, custom Jest matchers and
an isolated MongoDB database-per-suite harness.

## Matchers

Register once per consumer, in the consumer's Jest config:

```js
import { createJestConfig } from '@reliance/config/jest/base';

export default createJestConfig({
  setupFilesAfterEnv: ['@reliance/testing/jest.setup'],
});
```

Then in any test:

```ts
expect(repositoryRow).toEqualMoney(Money.fromMajor('1,250.00', 'GBP'));
expect(journalEntry).toBalance(); // debits === credits, per currency
```

Both matchers are shape-agnostic: they accept the domain `Money` value object, its `MoneyJSON` wire
form and hydrated Mongoose subdocuments on either side.

## Builders

Builders produce **contract-valid** data — `build()` runs the contract zod schema, so a builder can
never emit an object the API would reject. Defaults are deterministic (a fixed seed, fixed
timestamps); override only what the test cares about.

```ts
import { aUser, anAccount, aBalance, aMoney, aJournalEntry } from '@reliance/testing';

const user = aUser().withEmail('ada@example.com').build();
const account = anAccount()
  .withUserId(user.id)
  .withBalance(aBalance().withLedger(500_000n).build())
  .build();
const entry = aJournalEntry().withAmount(50_000n).withAccountId(account.id).build();
```

Available builders: `aMoney()`, `aBalance()`, `aUser()`, `anAccount()`, `aJournalEntry()` (balanced
by construction), plus `testId(prefix)` for prefixed ULIDs and `createSeededFaker(seed)` for a
deterministic faker (GB locale).

## Mongo harness

One harness per suite gives that suite its own database on the local replica set (`pnpm db:up`).
Spin-up is well under the 3-second budget; teardown drops the database. Suites can therefore run in
parallel against one server, with real multi-document transactions.

```ts
import { MongoTestHarness } from '@reliance/testing';

let harness: MongoTestHarness;

beforeAll(async () => {
  harness = await MongoTestHarness.start(); // uses MONGODB_URI, else localhost rs0
});

afterEach(() => harness.reset()); // empties every collection, keeps indexes
afterAll(() => harness.stop()); // drops the database, closes the connection
```

The harness needs the replica set running: `pnpm db:up` at the repo root.
