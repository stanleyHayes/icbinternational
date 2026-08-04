# Agent changelog

One line per completed task. Newest first. Format:

```
YYYY-MM-DD · TASK-ID · agent · one-line summary
```

---

2026-08-03 · FIX · claude · **No React Server Component could import the design system.** 29
hook-bearing modules in `packages/ui` lacked `'use client'`, so importing any of them — including
the pure parts — failed the build. Two front-end lanes hit it independently 2026-08-03 · FIX ·
claude · App Jest configs could not resolve the `@/` alias or transform MSW's ESM chain, which is
why one lane shipped no tests at all rather than write suites in relative paths. Marketing now runs
26 tests and admin 68, both previously unrunnable. Installed `mockServiceWorker.js` in all three
apps, so `NEXT_PUBLIC_USE_MOCKS=1` actually starts something 2026-08-03 · VOICE · claude · **A §4.6
violation the scanner could not see.** `makeArticle` emitted `faker.lorem.paragraphs(6)` and
`makeLocation` invented American city names beside GB postcodes — both rendered verbatim on the
marketing site. Replaced with four real articles and 26 real UK locations, and widened the scanner
to cover `packages/mocks/src/factories`, whose output reaches a screen. 1,774 files now scanned
2026-08-03 · CONTRACT · claude · v1.1.1 — `ID_PREFIX` for loan applications, bill payments, payment
requests and mandates. Four lanes were each minting a borrowed prefix 2026-08-03 · FIX · claude ·
**Second-factor entry was unusable, and it was a real bug.** Typing a digit into the OTP field never
advanced the caret, so `maxLength` silently rejected every digit after the first. Root cause: the
`onFocus` guard that keeps the code compact read `value` from a closure captured _before_
`setValue`, so when `commit` moved focus in the same tick the guard saw an empty field, judged box 1
out of range, and pulled the caret back to box 0. Now tracked in a ref that `commit` writes
synchronously. The 4 tests I had earlier recorded as a harness defect in `HANDOFFS.md` were correct
all along — a front-end agent independently reproduced it in Chrome 2026-08-03 · FIX · claude ·
**ESLint could not lint any Next app.** `settings.react.version: 'detect'` makes eslint-plugin-react
call `context.getFilename()`, removed in ESLint 10, so the plugin threw before reporting a single
rule. Pinned to `19.2` — React is catalog-pinned anyway, so detection was re-deriving a known
constant 2026-08-03 · FIX · claude · The Next page override globbed `app/**/page.tsx` while these
apps route from `src/app/**`, so it matched nothing. The override looked present in the config and
did precisely nothing. Corrected to `**/app/**`, plus route-level generated images 2026-08-03 ·
LEDGER · claude · Added GL **2400 Savings Vaults** and **1290 Loan Loss Allowance**, and repointed
the credit modules at them. Vault balances were sitting in Holds and Liens and the loan loss
allowance in Suspense — both because the chart had no word for them, which made the balance sheet
describe a lien where a customer had a savings goal 2026-08-03 · WS-L · claude · Showcase dataset: 8
archetypes, a 26-merchant weighted directory, weekend-biased spend and fixed-day subscriptions.
Every movement posts through `PostingService`, and `demo:reset` exits non-zero if the ledger does
not verify afterwards. Deterministic from `SIM_SEED`; 14 tests 2026-08-03 · DOCS · claude ·
Corrected `RUNBOOK.md`, which still listed the replica-set slowdown as an open issue after it was
fixed, and marked the handoff resolved. Added `SHOWCASE.md` 2026-08-03 · INTEGRATION · claude ·
Wired 20 feature modules into `app.module.ts`; API boots with **72 routes, zero errors**. Verified
end to end over HTTP: register → email verify → login → KYC tier gate → open account (real IBAN,
mod-97 valid) → transfer quote → execute. Insufficient-funds refused with zero journal entries
written — no partial state 2026-08-03 · FIX · claude · **Replica-set port bug (mine, from F-05).**
The set advertised `localhost:27017` while the container published 27317, so any driver doing
topology discovery burned the full 8s serverSelectionTimeoutMS — or, worse, could have reached a
_different_ project's MongoDB listening on 27017. mongod now listens on and advertises the published
port; `directConnection` dropped as the crutch it was. Measured 44ms where DB-backed suites
previously timed out 2026-08-03 · FIX · claude · Collision damage repaired: a lost `@Module({` line
and a duplicated constants block in `base-processor.integration.test.ts`, plus 41 type errors across
10 test files 2026-08-03 · FIX · claude · `AdminUserService.provision` now normalises the email at
the domain boundary, not only in the repository — two rows differing by case are two accounts the
login lookup can never both find 2026-08-03 · FIX · claude · Seeded roles now mint a deterministic
`id`; the collection has a unique index on it, so every role after the first collided on `id: null`
2026-08-03 · FIX · claude · `PostingService` import in `transfer-booking.service.ts` pointed at the
accounts module instead of the ledger 2026-08-03 · FIX · claude · OTP ref callbacks are now stable
per `length`. Returning a fresh closure per render made React detach and reattach every box ref on
every commit 2026-08-03 · CONTRACT · claude · v1.0.2 — export the inferred `ListTransfersQuery`
type; the schema shipped without it 2026-08-03 · TEST · claude · Jest now transforms the ESM-only
otplib crypto chain (`@scure`, `@noble`) via a `transformDependencies` option on the shared preset
2026-08-03 · PHASE-1 · claude · Twelve-agent workflow delivered ledger persistence, GL, auth, MFA,
devices, RBAC, audit, idempotency, jobs, products, seed, accounts, holds, transactions, insights,
beneficiaries, transfers, plus `packages/ui`, `api-client`, `mocks`, `testing` 2026-08-02 · F-05 ·
claude · MongoDB single-node replica set + Redis in compose; transactions verified; `.env` generated
with real secrets; ports remapped (mongo 27317, redis 6579, api 4400) to coexist with other local
stacks 2026-08-02 · F-04 · claude · `packages/contracts`: 20 modules covering the whole API surface
— error codes, primitives, envelopes, route map, and per-domain Zod schemas. Lint and build clean
2026-08-02 · F-03 · claude · `packages/money`: `Money` value object, currency registry,
remainder-safe allocation, explicit rounding, FX conversion. 137 tests, 100% coverage on all four
metrics 2026-08-02 · F-02 · claude · `packages/config`: TypeScript 7 bases, ESLint 10 flat config
with the §2.4 quality gate, `eslint-plugin-sonarjs`, two house rules (`no-float-money`,
`no-ambient-clock`), shared SWC/Jest preset 2026-08-02 · F-01 · claude · pnpm 11 workspace +
Turborepo 2, catalog-pinned dependencies, root scripts, dotfiles 2026-08-02 · A-01 · claude · Nest
bootstrap: Zod-validated config that refuses a non-replica-set Mongo URI,
helmet/CORS/compression/cookies, `/v1` prefix, OpenAPI at `/docs`, graceful shutdown. Boots clean
2026-08-02 · A-02 · claude · `common/`: `AppError` + global exception filter rendering the contract
envelope, response interceptor, trace middleware, `ClockService`, ULID `IdGenerator`, cursor
pagination, money codec 2026-08-02 · A-03 · claude · `database/`: connection with majority
read/write concern, `TransactionRunner` with retry on `TransientTransactionError` and write
conflicts, thin `BaseRepository`, shared schema conventions 2026-08-02 · A-12 · claude ·
`/v1/health` and `/v1/health/ready`; readiness asserts a writable replica-set primary, not merely a
connection 2026-08-02 · B-01 · claude · Ledger domain (framework-free): chart of accounts,
`Posting`, `JournalEntry` with the balance invariant enforced in the constructor, entry-shape
recipes. 42 tests 2026-08-02 · BRAND · claude · Logo system (mark, horizontal, on-dark, mono,
favicon), design tokens, brand guide. Outfit throughout 2026-08-02 · PLAN · claude · `agent_plan.md`
— end-to-end feature plan, 13 workstreams, exclusive file ownership, contract-change and handoff
protocols
