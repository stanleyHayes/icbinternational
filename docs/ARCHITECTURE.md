# Architecture

How Reliance Bank is put together. This document describes the _shape_ of the system; for vocabulary
see `docs/DOMAIN-GLOSSARY.md`, for individual trade-offs see `docs/DECISIONS.md`. Where something is
not yet built, it is marked **(planned)** — `agent_plan.md` is the build schedule.

---

## System shape

Four deployables talk to one API. Only the API touches the database.

```
                        ┌──────────────────────────────┐
   Public ──────────────► apps/web-marketing (Next 16) │  SSG/ISR, CMS-driven  (planned)
                        └───────────────┬──────────────┘
                                        │ public REST
   Customer ────────────┌───────────────▼──────────────┐
                        │ apps/web-client   (Next 16)  │  RSC + server actions → BFF  (planned)
                        └───────────────┬──────────────┘
   Staff ───────────────┌───────────────▼──────────────┐
                        │ apps/web-admin    (Next 16)  │  Ops console  (planned)
                        └───────────────┬──────────────┘
                                        │  HTTPS · JWT httpOnly cookie · CSRF double-submit
                        ┌───────────────▼──────────────────────────────────────┐
                        │            apps/api  —  NestJS 11                    │
                        │  controllers → services → domain → repositories      │
                        └───┬───────────────┬───────────────┬──────────────────┘
                            │               │               │
              ┌───────▼──────┐   ┌──────────▼─────┐   ┌─────▼──────────┐
              │ MongoDB (RS) │   │ Scheduled tasks│   │ Providers      │
              │ ledger, docs │   │ jobs, cache,   │   │ simulated rails│
              │ port 27317   │   │ rate limiting  │   │ + Resend /     │
              └──────────────┘   │ port 6579      │   │ Cloudinary     │
                                 └────────────────┘   └────────────────┘
```

The front ends never hold the JWT in JavaScript: the API sets an httpOnly cookie and each Next.js
app's route handlers forward it (BFF pattern), adding the CSRF double-submit token.

## The five non-negotiables

1. **Double-entry or it didn't happen.** No balance is ever mutated directly. Every movement of
   value is a balanced journal entry (debits == credits, per currency) written inside a MongoDB
   multi-document transaction. Account balances are projections, rebuildable from postings at any
   time. See ADR-001.
2. **Integer minor units.** Money is `bigint` minor units plus an ISO-4217 currency, wrapped in the
   `Money` value object from `@reliance/money` — the only place arithmetic on money is legal. Floats
   are banned by a custom ESLint rule. See ADR-002.
3. **Idempotency everywhere.** Every mutating money endpoint requires an `Idempotency-Key` header.
   Replays return the stored original response; the same key with a different payload is an error.
   Implemented in `apps/api/src/modules/idempotency/` (`@Idempotent()` + interceptor); registration
   in `AppModule` is pending — see `docs/HANDOFFS.md`.
4. **Everything is audited.** Every state change appends an immutable, hash-chained `audit_events`
   record with actor, IP and before/after. Mutating history breaks the chain and the verifier says
   where. Implemented in `apps/api/src/modules/audit/` (`@Audited()`, interceptor, chain verifier);
   registration in `AppModule` is pending — see `docs/HANDOFFS.md`.
5. **Simulated ≠ fake.** ACH, SWIFT, the card network, billers, SMS and the KYC vendor are in-house
   simulators behind the same ports a real rail would implement — with configurable latency, failure
   rates, cut-off windows and settlement batches. See ADR-004.

## Repository layout

```
apps/
  api/                NestJS 11 core banking API — the only deployable that exists today
packages/
  contracts/      🔒  DTOs, Zod 4 schemas, enums, route paths, error codes (17 modules)
  money/          🔒  Money value object, currency table, formatting — 100% coverage
  ui/                 Design system: React 19 + Tailwind 4 + Radix (in progress)
  api-client/         Typed fetch client derived from contracts
  mocks/              MSW handlers + fixture factories for the whole API surface
  testing/            Test harness, builders, custom matchers
  config/             Shared tsconfig bases, ESLint flat presets, Jest/SWC preset
infra/docker/         MongoDB single-node replica set (+ mongo-express under a profile)
brand/                Logo system and design tokens (delivered)
docs/                 This documentation set
agent_plan.md         The build plan: task board, ownership globs, acceptance criteria
```

🔒 = frozen after Phase 0. Changes follow the Contract Change Protocol (`agent_plan.md` §4.3,
proposals in `docs/CONTRACT_CHANGES.md`).

Planned but not yet present: `apps/web-marketing`, `apps/web-client`, `apps/web-admin`, `e2e/`,
`infra/ci/`.

## Layers inside `apps/api`

Enforced by ESLint `import/no-restricted-paths` — a violation fails lint, not just review.

```
src/
  main.ts             Bootstrap: helmet, CORS, cookies, /v1 prefix, OpenAPI at /docs (non-prod)
  app.module.ts       Root module: config, clock, database, health + global filter/interceptor
  config/             Zod-validated environment — a bad env aborts boot with a readable message
  common/             AppError + filter, response envelope, trace middleware, ClockService,
                      ULID IdGenerator, cursor pagination, money codec, ZodValidationPipe
  database/           Mongoose connection, TransactionRunner (retries transient conflicts),
                      BaseRepository
  domain/ledger/      Framework-free ledger: JournalEntry, Posting, chart of accounts,
                      entry recipes. Imports money + contracts only — NO Nest, NO Mongoose
  modules/            Feature modules: health, ledger, gl, audit, idempotency, auth (in flight),
                      products, accounts/transactions (scaffolds)
  rails/              Simulated payment rails behind ports  (planned)
  seed/               Foundation data (chart of accounts, products, roles) + demo reset (L-05
                      planned)
```

The dependency rule, one line per layer:

- **controllers** → services, DTOs, contracts
- **services** → domain, repositories, ports, contracts
- **domain** → money, contracts (framework-free; unit-testable with zero mocks)
- **repositories** → schemas, domain, mongoose
- **rails** → implement ports; domain, contracts

A service never touches a Mongoose model directly — it goes through a repository.

## The ledger

The heart of the system. Domain model in `apps/api/src/domain/ledger/`, persistence in
`apps/api/src/modules/ledger/` — `PostingService.post()` writes entries and effects inside a
transaction, `ReversalService` mirrors entries with flipped directions, and `LedgerVerifierService`
replays the book. Customer-balance effects currently flow through an `AccountBalancePort` bound to
an in-memory adapter; the Mongo-backed binding arrives with the accounts module (B-04) — see
`docs/HANDOFFS.md`.

```
chart_of_accounts   Internal GL: ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
                    1000 Cash at Central Bank · 2000 Customer Deposits · 4000 Fee Income · …

journal_entries     One per atomic financial event. Immutable. { reference, valueDate,
                    bookedAt, status, postings[], metadata }

postings[]          ≥ 2 per entry; SUM(debits) === SUM(credits) per currency, enforced in
                    the domain (an unbalanced entry cannot be constructed) and by a Mongo
                    $jsonSchema validator

accounts            Customer-facing. ledgerBalance / availableBalance / holdTotal are a
                    projection of postings — a cache with the postings as source of truth
```

A customer's account is a **liability of the bank** (money it owes the customer), so a credit
increases the customer's balance. Every customer posting carries the control account
`2000 Customer Deposits` as its counterparty automatically. See `docs/DOMAIN-GLOSSARY.md`.

**Invariants** asserted in CI and by a nightly job (planned — M-03):

- every journal entry balances, per currency;
- the sum of all customer account balances equals GL 2000;
- the trial balance sums to zero across the whole book;
- replaying every posting from zero reproduces every balance exactly (`pnpm ledger:verify`).

## Money

`packages/money` — the only place arithmetic on money is legal.

```ts
type Money = { readonly amount: bigint; readonly currency: CurrencyCode };
```

Minor-unit exponents come from the currency table (JPY = 0, USD = 2, KWD = 3) — never hardcoded.
Rates are integer basis points, so no percentage is ever a float. Stored in Mongo as
`{ amount: Long, currency: string }` via the codec in `apps/api/src/common/money/`.

## Cross-cutting conventions

- **Errors.** `AppError(code, message, details?, httpStatus)` with a code from contracts. The global
  filter renders `{ error: { code, message, details, traceId, at } }`. Raw `throw new Error` is not
  allowed.
- **Responses.** Single resource: `{ data: T }`. Lists:
  `{ data: T[], page: { cursor, limit, hasMore, total? } }`. Cursor pagination everywhere; offset
  only in admin exports.
- **Time.** All server-side "now" comes from the injectable `ClockService` — never `new Date()`
  (banned by lint in `apps/api/src`). The simulated clock lets the ops console advance time a month
  and produce a real month of interest, statements and arrears.
- **IDs.** Mongo `ObjectId` internally; public IDs are prefixed ULIDs (`acc_01H…`, `txn_01H…`) from
  `IdGenerator`.
- **Validation.** The Zod schemas from `@reliance/contracts`, applied by `ZodValidationPipe` — the
  same schemas the front ends use in their forms.
- **Logging.** pino, structured, `traceId` on every line, money and PII redacted.
- **Auth (in flight — A-04/A-05).** JWT in httpOnly cookie, refresh rotation with reuse detection,
  Argon2id, TOTP + passkeys, step-up token for high-value operations.

## Datastores and ports

- **MongoDB 8, single-node replica set `rs0`.** Transactions do not exist on a standalone, so the
  compose file auto-initiates the set and the API _refuses to become ready_ without a writable
  primary (`GET /v1/health/ready` checks it explicitly). Majority write/read concerns;
  `TransactionRunner` retries on transient transaction errors.
- **In-process scheduled tasks.** Bank behaviour is clock-driven — maintenance fees, mandate
  collection, FX alerts, payment-request expiry, bill submission and refunds all arrive on a
  timer. Each is a `BaseScheduledTask` sweeping its own due set out of MongoDB on a fixed
  interval. This replaced Redis + BullMQ; the trade is no retry/backoff, no dead-letter queue,
  and one sweep per process, so the deployment is single-instance. Every sweep is idempotent
  against its own claim state, which is what makes that safe.
- **Provider boundary.** Resend (email) and Cloudinary (media) are the only real third parties, both
  behind ports (`EmailSenderPort`, `MediaStoragePort`) with in-memory fakes. With keys unset the API
  logs emails and fakes uploads — no test, seed or CI run may reach either provider.

## Environments and ports

Non-default host ports so this stack runs alongside others on the same machine.

| Service          | Port  | Notes                                  |
| ---------------- | ----- | -------------------------------------- |
| Core API         | 4400  | `/v1` prefix, OpenAPI at `/docs` (dev) |
| Marketing site   | 3000  | planned                                |
| Client dashboard | 3001  | planned                                |
| Admin console    | 3002  | planned                                |
| MongoDB          | 27317 | replica set `rs0`                      |
| mongo-express    | 8481  | optional, `tools` compose profile      |

The live chat stream (`WS /v1/chat/stream`) is a long-held socket on the API's port, which
settles the deployment target: the Render web service (`render.yaml`) holds it fine, the
`apps/api/vercel.json` serverless variant cannot — deploy chat on Render, or the stream
never connects.

## Testing strategy

- **Domain and `packages/money`: 100% coverage**, property-tested (allocation never loses a minor
  unit; an unbalanced entry cannot be constructed). Domain tests use zero mocks.
- **Integration** (planned — M-02): supertest against a real Mongo replica set per suite; every
  endpoint gets a happy path, an auth failure, a validation failure and an idempotency test.
- **Ledger stress** (planned — M-03): 500 concurrent transfers leave the book balanced.
- **E2E** (planned — M-04): Playwright customer and admin journeys against the seeded demo.
- **Mocks-first**: `packages/mocks` (F-06) serves MSW handlers for every contract route — all 229 of
  them, fixture-validated against the frozen schemas — so front ends never wait for the backend;
  `NEXT_PUBLIC_USE_MOCKS=1` flips the flag.

## What exists today vs. what is planned

Built and green: monorepo foundation (F-01…F-05), api-client + mocks (F-06), API bootstrap + config
(A-01), `common/` (A-02), `database/` (A-03), health (A-12), ledger domain (B-01), ledger
persistence + verifier (B-02), GL chart, seeding and trial balance (B-03), audit writer + chain
verifier (A-07), idempotency (A-08), seed foundation (L-01, in progress).

In flight: auth + MFA (A-04/A-05 — an ownership collision in `modules/auth/` awaits an orchestrator
decision; see `docs/HANDOFFS.md`), the design system (I-01…I-05), accounts and transactions
(scaffolds). Audit and idempotency are implemented but not yet registered in `AppModule`.

Planned: RBAC, jobs, files, rate limiting, transfers and rails, cards, credit, risk, comms/CMS, the
three Next.js front ends, personas/demo seed, and the quality gates (M-01…M-07). This document is
updated as lanes land; trust the code over this file and open a PR when they disagree.
