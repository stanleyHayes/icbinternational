# Reliance Bank — End-to-End Agent Build Plan

> **Status:** v1.0 · Living document · Greenfield **Mission:** A banking platform that behaves
> _exactly_ like a real retail + business bank — double-entry ledger, KYC, cards, loans, FX, AML,
> statements, disputes, ops tooling — where the only thing that is simulated is the movement of
> value outside our own boundary. **No real money moves. Ever.** Every "external" rail (ACH, SWIFT,
> card network, biller) is a deterministic in-house simulator behind the same interface a real rail
> would expose.

---

## 0. How to use this document

This plan is written so that **many agents can work at the same time without blocking or
colliding.**

Three mechanisms make that possible:

1. **Contracts-first.** `packages/contracts` is written _once_, in Phase 0, before any feature work.
   It holds every DTO, enum, error code and route path. After Phase 0 it is _frozen_ — changes go
   through the Contract Change Protocol (§4.3). Every other workstream codes against it.
2. **Mock-first.** `packages/mocks` ships MSW handlers for the entire API surface, derived from the
   contracts. **Frontend agents never wait for a backend agent.** They develop and test against
   mocks and flip a single env flag to hit the real API.
3. **Exclusive file ownership.** Every task below declares `Owns:` — a set of path globs. **No two
   tasks that can run concurrently own the same glob.** If you need to change a file you don't own,
   you do not edit it: you open a Handoff Note (§4.4).

### Claiming a task

```
1. Pick any task whose Depends-on tasks are all ✅ DONE.
2. Set its Status to 🔵 IN-PROGRESS and put your agent id in Owner.
3. Work ONLY inside the paths listed under `Owns:`.
4. Satisfy every line of `Acceptance:` — including tests.
5. Run `pnpm verify` (lint + typecheck + test + build) at the repo root. It must be green.
6. Set Status ✅ DONE. Append one line to `docs/CHANGELOG-AGENTS.md`.
```

### Status legend

`⬜ TODO` · `🔵 IN-PROGRESS` · `🟡 BLOCKED` (say why + on what) · `✅ DONE` · `⏭ DEFERRED`

---

## 0.1 Current state — what is already built

Phase 0 is complete and the API boots. `pnpm verify` is green across every package.

| Task                                  | Status  | Evidence                                                                                                              |
| ------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| **F-01** monorepo skeleton            | ✅ DONE | pnpm 11 workspace + Turborepo 2, catalog-pinned                                                                       |
| **F-02** shared config                | ✅ DONE | TS 7 bases, ESLint 10 + SonarJS + 2 house rules, SWC/Jest preset                                                      |
| **F-03** `packages/money`             | ✅ DONE | 137 tests, **100%** statements/branches/functions/lines                                                               |
| **F-04** `packages/contracts`         | ✅ DONE | 20 modules, full route map + error vocabulary; lint + build clean                                                     |
| **F-05** infra                        | ✅ DONE | Mongo `rs0` primary verified, multi-doc transaction committed, Redis up                                               |
| **F-06** api-client + mocks           | ✅ DONE | Typed client with shared-refresh on 401; MSW handlers with a stateful store                                           |
| **F-07** testing harness              | ✅ DONE | `packages/testing` — seeded faker, builders                                                                           |
| **A-04/05** auth · MFA · devices      | ✅ DONE | Argon2id, refresh rotation with family revocation, TOTP, passkeys, step-up. 3 harness tests open (`docs/HANDOFFS.md`) |
| **A-06** RBAC                         | ✅ DONE | 10 roles, permission-string guards                                                                                    |
| **A-07/08** audit · idempotency       | ✅ DONE | Hash-chained append-only log; index-race-proof key claim                                                              |
| **A-10** jobs                         | ✅ DONE | BullMQ queues, DLQ, replay                                                                                            |
| **B-02/03** ledger persistence · GL   | ✅ DONE | Balance invariant guarded at three layers; verifier detects injected drift                                            |
| **B-04/05** accounts · holds          | ✅ DONE | mod-97 IBAN, ownership-checked, availability under concurrency                                                        |
| **B-06** transactions · insights      | ✅ DONE | Cursor pagination, categorisation, CSV/OFX, budgets                                                                   |
| **C-01/L-01** products · seed         | ✅ DONE | Effective-dated versions; seed idempotent (89 unchanged on rerun)                                                     |
| **D-02/05** transfers · beneficiaries | ✅ DONE | One journal entry per transfer; 94 ledger+transfer tests green against the real replica set                           |
| **I-01..04** design system            | ✅ DONE | 222/226 tests; 4 OTP failures open (`docs/HANDOFFS.md`)                                                               |
| **M-06** CI · SonarQube               | ✅ DONE | Four-job pipeline; integration job stands up a real replica set                                                       |
| everything else                       | ⬜ TODO | See the workstream tables below                                                                                       |

**Next on the critical path:** the three front ends (`WS-I 06–10`, `WS-J`, `WS-K`) — the API now has
72 routes and nothing consuming them. Then `WS-L` personas, and the remaining API modules (cards,
credit, FX, payments, risk, comms).

Lanes unblocked **right now** with no shared files: `WS-J` client dashboard, `WS-K` admin console,
`WS-I 06–10` marketing site (all three against `@reliance/mocks`), `WS-E` cards, `WS-F` credit,
`WS-C 03/04` FX, `WS-G` risk, `WS-H` comms.

---

## 1. Product scope

### 1.1 What Reliance Bank is

A full-stack simulation of a licensed retail + SME bank operating in a multi-currency market.

| Surface              | Audience                    | Auth                                            | Deploy target          |
| -------------------- | --------------------------- | ----------------------------------------------- | ---------------------- |
| **Marketing site**   | Public / prospects          | None (public)                                   | `reliancebank.com`     |
| **Client dashboard** | Retail + business customers | Password + 2FA + passkeys                       | `app.reliancebank.com` |
| **Admin console**    | Bank staff (10 roles)       | SSO-style login + mandatory TOTP + IP allowlist | `ops.reliancebank.com` |
| **Core API**         | All of the above            | JWT (httpOnly cookie) / service tokens          | `api.reliancebank.com` |

### 1.2 The five non-negotiables

1. **Double-entry or it didn't happen.** No balance is ever mutated directly. Every movement of
   value is a balanced journal entry inside a MongoDB transaction. Debits == credits, always.
2. **Integer minor units.** Money is `bigint` minor units + ISO-4217 currency. Floats are banned by
   an ESLint rule. `1.10 + 2.20 !== 3.30` is not a bug we are willing to have.
3. **Idempotency everywhere.** Every mutating money endpoint requires an `Idempotency-Key`. Replays
   return the original response, never a second transfer.
4. **Everything is audited.** Every state change writes an immutable `audit_events` record with
   actor, IP, before/after, and a hash chain. Admin actions on customer data are non-optional.
5. **Simulated ≠ fake.** Rails are simulated but _honest_: latency, intermittent failure, settlement
   windows, cut-off times, reversals, chargebacks. If a real bank has to handle it, we handle it.

---

## 2. Architecture

### 2.0 Locked stack decisions

Every package is pinned to its **current major**. Versions live in the `catalog:` block of
`pnpm-workspace.yaml` — declare `"catalog:"` in a package.json, never a literal version.

| Layer      | Choice                                                               | Why this one                                                                  |
| ---------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Language   | **TypeScript 7** (`strict`, `noUncheckedIndexedAccess`)              | Verified to emit `design:paramtypes`, so Nest DI works on the native compiler |
| Repo       | pnpm 11 workspaces + Turborepo 2                                     | Four apps sharing one contract package                                        |
| Backend    | **NestJS 11** + **Mongoose 9** + MongoDB 8 (single-node replica set) | Transactions require a replica set — non-negotiable for a ledger              |
| Frontends  | **Next.js 16** App Router × 3 + **React 19**                         | Separate deploys, separate auth surfaces                                      |
| Styling    | **Tailwind CSS 4** + Radix primitives                                | Token-driven; theme generated from `brand.tokens.json`                        |
| Validation | **Zod 4**, one schema shared by API and all three frontends          | One definition, three consumers                                               |
| Async      | **BullMQ 6** + Redis 8                                               | Bank behaviour is clock-driven: interest, standing orders, statements         |
| Email      | **Resend** + React Email                                             | Real deliverability and webhook events; templates are JSX, not string soup    |
| Media      | **Cloudinary** behind a `MediaStoragePort`                           | KYC documents, card art, CMS media, avatars — signed, private delivery        |
| Money      | Integer minor units + double-entry ledger                            | Floats are banned by lint rule                                                |
| Type       | **Outfit** — one family, whole brand                                 | Wordmark, marketing, product UI, statements                                   |
| Quality    | ESLint 10 + `eslint-plugin-sonarjs` + two house rules                | The §2.4 gate is machine-enforced, not aspirational                           |

**Provider boundaries.** Resend and Cloudinary are the only third parties that see real traffic, and
both sit behind a port interface (`EmailSenderPort`, `MediaStoragePort`) with an in-memory fake used
by every test. No test, seed or CI run may hit either provider. The banking _rails_ — ACH, SWIFT,
card network, billers, SMS, KYC vendor — remain fully simulated in-house.

### 2.1 System shape

```
                        ┌──────────────────────────────┐
   Public ──────────────► apps/web-marketing (Next 16) │  SSG/ISR, CMS-driven
                        └───────────────┬──────────────┘
                                        │ public REST (rates, cms, locator, leads)
   Customer ────────────┌───────────────▼──────────────┐
                        │ apps/web-client   (Next 16)  │  RSC + server actions → BFF route handlers
                        └───────────────┬──────────────┘
   Staff ───────────────┌───────────────▼──────────────┐
                        │ apps/web-admin    (Next 16)  │
                        └───────────────┬──────────────┘
                                        │  HTTPS · JWT httpOnly cookie · CSRF double-submit
                        ┌───────────────▼──────────────────────────────────────┐
                        │            apps/api  —  NestJS 11                    │
                        │  ┌────────────────────────────────────────────────┐  │
                        │  │ Interface layer   controllers · guards · pipes  │  │
                        │  │ Application layer services · use-cases · sagas  │  │
                        │  │ Domain layer      entities · value objects      │  │
                        │  │ Infra layer       repositories · rails · queue  │  │
                        │  └────────────────────────────────────────────────┘  │
                        └───┬───────────────┬───────────────┬──────────────────┘
                            │               │               │
      ┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼──────────┐ ┌──▼──────────────┐
      │ MongoDB (RS) │ │ Redis+BullMQ│ │ Simulated rails │ │ Real providers  │
      │ ledger·docs  │ │ jobs·cache  │ │ ACH·SWIFT·Card  │ │ Resend (email)  │
      │              │ │ ratelimit   │ │ Biller·SMS·KYC  │ │ Cloudinary(docs)│
      └──────────────┘ └─────────────┘ └─────────────────┘ └─────────────────┘
```

### 2.2 Repository layout

```
reliancebank/
├── apps/
│   ├── api/                    NestJS core banking API
│   ├── web-marketing/          Next.js public site
│   ├── web-client/             Next.js customer dashboard
│   └── web-admin/              Next.js operations console
├── packages/
│   ├── contracts/              🔒 DTOs, zod schemas, enums, route map, error codes
│   ├── money/                  🔒 Money value object, currency table, formatting
│   ├── ui/                     Design system (React + Tailwind + Radix)
│   ├── mocks/                  MSW handlers + fixture factories
│   ├── api-client/             Typed fetch client generated from contracts
│   ├── config/                 Shared eslint / tsconfig / tailwind / prettier
│   └── testing/                Test harness, builders, custom matchers
├── infra/
│   ├── docker/                 compose, mongo RS init, seed volumes
│   └── ci/                     GitHub Actions workflows
├── docs/
├── brand/                      ✅ logo + tokens (delivered)
└── agent_plan.md
```

🔒 = frozen after Phase 0. Contract Change Protocol applies.

### 2.3 Layering rules inside `apps/api` (enforced by ESLint `import/no-restricted-paths`)

```
controllers  →  may import: services, dto, contracts
services     →  may import: domain, repositories, ports, contracts
domain       →  may import: money, contracts        (NO nest, NO mongoose)
repositories →  may import: schemas, domain, mongoose
rails        →  implement ports; may import: domain, contracts
```

Domain code is framework-free and unit-testable with zero mocks. A service never touches a Mongoose
model directly — it goes through a repository interface.

### 2.4 Code quality bar (SonarQube-grade — CI enforces)

| Rule                  | Threshold                                                       |
| --------------------- | --------------------------------------------------------------- |
| File length           | ≤ 250 lines (tests ≤ 400)                                       |
| Function length       | ≤ 40 lines                                                      |
| Cyclomatic complexity | ≤ 10 per function                                               |
| Function parameters   | ≤ 4 (else pass an options object)                               |
| Nesting depth         | ≤ 3 — use guard clauses                                         |
| Duplicated blocks     | 0                                                               |
| `any`                 | Banned. `unknown` + narrowing                                   |
| Magic numbers/strings | Banned — named constants or enums                               |
| Cognitive complexity  | ≤ 15                                                            |
| Test coverage         | ≥ 80% lines overall, **100% on `domain/` and `packages/money`** |
| Public API surface    | Every exported symbol has a TSDoc line                          |

**One concern per file.** A controller file holds one controller. A service that grows a second
responsibility gets split. If a file crosses 250 lines, that is a design signal, not a lint nag.

---

## 3. The domain model

### 3.1 Money

```ts
// packages/money — the only place arithmetic on money is legal
type Money = { readonly amount: bigint; readonly currency: CurrencyCode };
```

Stored in Mongo as `{ amount: Long, currency: string }`. Minor-unit exponent comes from the currency
table (JPY = 0, USD = 2, KWD = 3). Formatting, parsing, allocation (remainder-safe splitting),
comparison and FX conversion all live here. **Nothing else may do math on money.**

### 3.2 The ledger (the heart of the system)

```
chart_of_accounts          Internal GL accounts. Type: ASSET|LIABILITY|EQUITY|INCOME|EXPENSE
   ├── 1000 Cash at Central Bank        (ASSET)
   ├── 1100 Card Network Settlement     (ASSET)
   ├── 1200 Loans Receivable            (ASSET)
   ├── 2000 Customer Deposits           (LIABILITY)   ← every customer account rolls up here
   ├── 2100 Unsettled Inbound           (LIABILITY)
   ├── 2200 Holds & Liens               (LIABILITY)
   ├── 3000 Retained Earnings           (EQUITY)
   ├── 4000 Fee Income / 4100 Interest Income / 4200 FX Spread Income   (INCOME)
   └── 5000 Interest Expense / 5100 Loan Loss Provision                 (EXPENSE)

journal_entries            One per atomic financial event. Immutable.
   { _id, reference, description, valueDate, bookedAt, status, postings[], metadata }

postings[]                 ≥2 per entry. SUM(debit) === SUM(credit) — enforced in domain + a
   { ledgerAccountId, accountId?, direction: DEBIT|CREDIT, amount: Money }   Mongo schema validator

accounts                   Customer-facing account. Balance is a *projection*, rebuildable from
   { number, iban, type, currency, ledgerBalance, availableBalance, holdTotal, status, ... }
                           postings at any time. `pnpm ledger:verify` re-derives and diffs.

transactions               Customer-readable view of a journal entry: merchant, category, icon,
                           running balance, dispute state. Never the source of truth.
```

**Invariant checks that run in CI and in the nightly job:**

- Every journal entry balances, per currency.
- `SUM(all customer account balances) === balance of GL 2000 Customer Deposits`.
- Trial balance: `SUM(debits) === SUM(credits)` across the whole book.
- Replaying every posting from zero reproduces every current balance, exactly.

### 3.3 Collections (28)

| Collection                | Purpose                                         | Key indexes                                         |
| ------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `users`                   | Identity, credentials, MFA, status              | `email`↑unique, `phone`↑unique                      |
| `sessions`                | Refresh tokens, device, IP, revocation          | `userId`, `refreshTokenHash`↑unique, TTL            |
| `devices`                 | Known devices, trust state, passkeys            | `userId+fingerprint`↑unique                         |
| `profiles`                | Personal data, address, employment              | `userId`↑unique                                     |
| `kyc_cases`               | Onboarding, tier, docs, risk score, decisions   | `userId`, `status+createdAt`                        |
| `documents`               | Uploaded files metadata (S3-compatible / local) | `ownerId`, `kind`                                   |
| `accounts`                | Customer accounts / wallets                     | `number`↑unique, `iban`↑unique, `userId+status`     |
| `chart_of_accounts`       | Internal GL                                     | `code`↑unique                                       |
| `journal_entries`         | Immutable double-entry records                  | `reference`↑unique, `bookedAt`, `status`            |
| `transactions`            | Customer-facing movements                       | `accountId+bookedAt`↓, `journalEntryId`, text index |
| `holds`                   | Authorisations, liens, pending debits           | `accountId+status`, `expiresAt` TTL                 |
| `idempotency_keys`        | Replay protection + stored responses            | `key+userId`↑unique, TTL 24h                        |
| `beneficiaries`           | Saved payees, trust cooling-off                 | `userId+status`                                     |
| `transfer_orders`         | Scheduled / recurring / standing orders         | `nextRunAt+status`                                  |
| `cards`                   | Virtual + physical, controls, PAN token         | `token`↑unique, `accountId`                         |
| `card_authorisations`     | Auth → capture → settle lifecycle               | `cardId+createdAt`, `status`                        |
| `loans`                   | Applications, schedules, balances               | `userId+status`                                     |
| `loan_repayments`         | Amortisation lines, arrears                     | `loanId+dueDate`                                    |
| `deposits`                | Fixed deposits / term products                  | `userId+maturityDate`                               |
| `savings_goals`           | Vaults, round-ups, auto-save rules              | `userId`                                            |
| `fx_rates`                | Rate history + spreads                          | `pair+asOf`↓                                        |
| `products`                | Product catalogue, fees, rates, limits          | `code`↑unique                                       |
| `statements`              | Generated PDF statements                        | `accountId+period`↑unique                           |
| `notifications`           | In-app + delivery log                           | `userId+createdAt`↓, `read`                         |
| `tickets`                 | Support threads + messages                      | `userId`, `status+priority`                         |
| `disputes`                | Chargebacks, evidence, outcomes                 | `transactionId`↑unique, `status`                    |
| `aml_alerts`              | Rule hits, cases, dispositions                  | `status+severity`, `userId`                         |
| `audit_events`            | Append-only, hash-chained                       | `actorId+at`↓, `entity+entityId`, `at`              |
| `admin_users` / `roles`   | Staff accounts + RBAC                           | `email`↑unique                                      |
| `cms_pages` / `cms_posts` | Marketing content                               | `slug`↑unique                                       |
| `feature_flags`           | Runtime toggles                                 | `key`↑unique                                        |
| `sim_state`               | Clock offset, chaos config, rail behaviour      | singleton                                           |

---

## 4. Working agreements

### 4.1 Branch & commit

- Branch per task: `feat/<TASK-ID>-<slug>` e.g. `feat/BE-14-transfers-domestic`.
- Conventional Commits. Scope = task id: `feat(BE-14): domestic transfer use-case`.
- Never commit to `main` directly. Never rebase another agent's branch.

### 4.2 Definition of Done (every task)

- [ ] Acceptance criteria all met
- [ ] Unit tests for domain logic; integration tests for any endpoint
- [ ] No file > 250 lines; no function > 40; complexity ≤ 10
- [ ] Zero `any`, zero magic values, zero TODOs left in code
- [ ] TSDoc on exported symbols
- [ ] `pnpm verify` green
- [ ] Errors use `AppError` + a contract error code — never a raw `throw new Error`
- [ ] New env vars added to `.env.example` **and** the config schema

### 4.3 Contract Change Protocol

`packages/contracts` and `packages/money` are frozen after Phase 0. To change them:

1. Append a proposal to `docs/CONTRACT_CHANGES.md`: what, why, who is affected.
2. Make it **additive** if at all possible (new optional field, new enum member).
3. Breaking change → bump `contracts` minor, list every consuming task id, and notify by editing the
   affected task rows here to 🟡 BLOCKED with the reason.
4. Regenerate `packages/api-client` and `packages/mocks` in the same commit.

### 4.4 Handoff Note

Need a change in a file you don't own? Do **not** edit it. Add an entry to `docs/HANDOFFS.md`:
`[from TASK-ID] → [to TASK-ID] :: file :: what's needed :: why`. Stub the behaviour locally behind
an interface so you are not blocked, and keep moving.

### 4.5 Shared conventions (read before your first line of code)

- **Errors**: `AppError(code: ErrorCode, message, details?, httpStatus)`. Global exception filter
  maps to `{ error: { code, message, details, traceId } }`. Codes live in contracts.
- **Responses**: lists are `{ data: T[], page: { cursor, limit, hasMore, total? } }`. Cursor
  pagination everywhere; offset only in admin exports.
- **Dates**: ISO-8601 UTC strings on the wire. `Date` in Mongo. Display TZ is a user preference.
  **All server-side "now" comes from `ClockService`**, never `new Date()` — the simulator moves
  time.
- **IDs**: Mongo `ObjectId` internally; public ids are prefixed ULIDs (`acc_01H…`, `txn_01H…`).
- **Validation**: one zod schema per DTO in contracts; Nest `ZodValidationPipe` consumes it; the
  frontends use the same schema in react-hook-form. One definition, three consumers.
- **Logging**: pino, structured, `traceId` on every line, **money and PII redacted**.
- **Naming**: files `kebab-case.ts`, classes `PascalCase`, functions `camelCase`, constants
  `SCREAMING_SNAKE`. Nest files carry their role: `*.controller.ts`, `*.service.ts`,
  `*.repository.ts`, `*.schema.ts`, `*.dto.ts`, `*.use-case.ts`, `*.port.ts`, `*.rail.ts`.

---

### 4.6 Product voice — BINDING on every task that produces UI, copy or email

**Reliance Bank presents as a bank. Not as a demo of one.**

No rendered surface may disclose that this is a simulation. That means **no** banner, ribbon,
watermark, badge, tooltip, footer note, meta tag, page title, alt text, console message, empty state
or error message anywhere in the marketing site, the client dashboard, the admin console or an email
that contains — or paraphrases — any of:

> simulation · simulated · demo · demonstration · sandbox · test bank · fake · mock · dummy · sample
> · "not a real bank" · "no real money" · "for illustrative purposes" · "practice account"

This applies to visible text **and** to anything a user can trivially surface: `<title>`, `og:`
tags, `aria-label`, image `alt`, JSON-LD, the PWA manifest, favicon tooltips, HTTP response messages
and validation copy.

**Write real product copy.** A page that says "Lorem ipsum" or "Demo content" has the same problem
by another route. Marketing pages get real propositions, real rate tables, real terms. Error
messages read the way a bank's do: _"We couldn't complete this transfer because the available
balance is too low."_ — never _"simulated rail returned FAILURE"_.

**Seeded content is product content.** CMS pages, blog posts, FAQs, biller names, branch addresses
and email templates are all rendered to users. They get the same standard.

#### Where the honest markers DO live

Removing the markers from the product does not mean removing them. They move to the developer
surface, where they protect the project without breaking it:

| Surface                           | Marker                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `README.md`, `docs/**`, `LICENSE` | Full disclosure. This is the canonical statement                             |
| `package.json` descriptions       | "simulation" stays                                                           |
| Code comments, ADRs, this plan    | Unrestricted — say exactly what is real                                      |
| Email domains                     | `@reliancebank.example` — a reserved TLD that cannot resolve or deliver      |
| Card PANs                         | Reserved test BIN ranges only, so a number can never route on a real network |
| `NODE_ENV=production` boot        | The API logs a startup warning naming the simulated rails                    |

**Why the split.** "Reliance Bank" collides with a real institution. A polished bank UI on a public
URL with nothing distinguishing it is an impersonation risk regardless of intent — so the repository
states plainly what this is, and the product does not undercut its own design. If this is ever
deployed somewhere the public can reach, put the disclosure in the hosting layer (a holding page,
HTTP auth, or a robots-excluded private domain), not in the product copy.

#### The one exception, framed correctly

The operations console needs controls for advancing the business date and running batch jobs. **Real
banks have exactly these tools** — end-of-day processing, batch scheduling, business-date management
— so they are named for what they operationally are (see WS-K), not "simulation". A back-office
batch console is not a disclosure.

---

## 5. Phase 0 — Foundation (⚠️ blocks everything; do these first, in order)

> Target: one agent, or three agents in the sequence shown. Nothing else starts until F-04 is done.

| ID       | Task                                                                                                                                                                                                          | Depends    | Owns                                                               | Acceptance                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **F-01** | Monorepo skeleton: pnpm workspace, Turborepo pipeline, root scripts (`dev/build/lint/test/verify`), `.gitignore`, `.editorconfig`, Node 24 pin                                                                | —          | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, root dotfiles | `pnpm install && pnpm verify` runs (trivially) green                                             |
| **F-02** | `packages/config`: tsconfig bases, ESLint flat config incl. the quality rules in §2.4 + `no-float-money` + layering rules, Prettier, commitlint, husky                                                        | F-01       | `packages/config/**`                                               | A file with `any`, a 41-line function, or a magic number fails lint                              |
| **F-03** | `packages/money`: `Money` VO, currency table, add/sub/mul/allocate/compare/format/parse, `Long` codec, 100% coverage                                                                                          | F-02       | `packages/money/**`                                                | Property tests prove allocation never loses a minor unit                                         |
| **F-04** | `packages/contracts`: **every** enum, DTO, zod schema, route constant and error code for the whole API in §7. Barrel-exported per module                                                                      | F-02       | `packages/contracts/**`                                            | `pnpm --filter contracts build` green; §7 fully covered                                          |
| **F-05** | `infra/docker`: compose with MongoDB **single-node replica set** (`rs0`, keyfile, auto-init) + Redis; `pnpm db:up/down/reset`. Email and media are hosted providers (Resend, Cloudinary) — no local stand-ins | F-01       | `infra/docker/**`, `.env.example`                                  | `pnpm db:up` → `db.runCommand({hello:1}).setName === 'rs0'`; a Mongo session transaction commits |
| **F-06** | `packages/api-client` (typed fetch, interceptors, refresh-on-401, idempotency header helper) + `packages/mocks` (MSW handlers + faker factories for all of §7)                                                | F-04       | `packages/api-client/**`, `packages/mocks/**`                      | Every contract route has a mock returning schema-valid data                                      |
| **F-07** | `packages/testing`: builders, custom matchers (`toBalance()`, `toEqualMoney()`), Mongo in-memory RS harness, seeded faker                                                                                     | F-03, F-05 | `packages/testing/**`                                              | Integration tests can spin an isolated DB in < 3s                                                |

After **F-04 + F-06**, all frontend workstreams unblock. After **F-05 + F-07**, all backend
workstreams unblock. They then run fully in parallel.

---

## 6. Workstreams

### WS-A · API Platform (backend core)

| ID       | Task                                                                                                                                                                                                                                        | Depends    | Owns                                                                           | Acceptance                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **A-01** | Nest bootstrap: `main.ts`, `AppModule`, zod-validated `ConfigModule`, pino logger, helmet, CORS, compression, global `ZodValidationPipe`, versioned `/v1` prefix, graceful shutdown                                                         | F-04, F-05 | `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/config/**` | Boots; `/v1/health` 200; bad env aborts startup with a readable message                                  |
| **A-02** | `common/`: `AppError`, global exception filter, response-shape interceptor, `traceId` middleware, `ClockService`, `IdGenerator` (ULID), cursor-pagination helper                                                                            | A-01       | `apps/api/src/common/**`                                                       | Thrown `AppError` renders the contract envelope; `ClockService` is injectable + fake-able                |
| **A-03** | `database/`: Mongoose connection factory, transaction runner (`withTransaction` + retry on `TransientTransactionError`), base repository, soft-delete plugin, index sync command                                                            | A-01       | `apps/api/src/database/**`                                                     | Retry proven by a forced write-conflict test                                                             |
| **A-04** | Auth: register, verify email, login, refresh rotation, logout, forgot/reset, Argon2id, account lockout, `JwtAuthGuard`, `@CurrentUser()`, httpOnly cookies + CSRF double-submit                                                             | A-02, A-03 | `apps/api/src/modules/auth/**`                                                 | Refresh-token reuse detection revokes the whole family                                                   |
| **A-05** | MFA & devices: TOTP enrol/verify/disable, recovery codes, WebAuthn passkeys, device fingerprint + trust, session list, remote revoke, step-up guard for high-value ops                                                                      | A-04       | `apps/api/src/modules/mfa/**`, `.../devices/**`                                | `@StepUp()` on an endpoint forces re-auth within a 5-min window                                          |
| **A-06** | RBAC: roles, granular permissions, `@RequirePermission()` guard, admin scope separation, IP allowlist guard                                                                                                                                 | A-04       | `apps/api/src/modules/rbac/**`                                                 | A support agent cannot reach a treasury endpoint; test proves 403                                        |
| **A-07** | Audit: append-only writer, hash chain (`prevHash`→`hash`), `@Audited()` decorator, before/after diff, tamper-verify command                                                                                                                 | A-03       | `apps/api/src/modules/audit/**`                                                | Mutating one historical record makes `pnpm audit:verify` fail                                            |
| **A-08** | Idempotency: `@Idempotent()` interceptor, key storage, in-flight lock, stored-response replay, conflict on payload mismatch                                                                                                                 | A-03       | `apps/api/src/modules/idempotency/**`                                          | Two concurrent identical transfers → one journal entry                                                   |
| **A-09** | Rate limiting + abuse: Redis sliding window per IP/user/endpoint class, login throttle, CAPTCHA hook, suspicious-velocity signal to AML                                                                                                     | A-03       | `apps/api/src/modules/throttle/**`                                             | Burst of 100 logins → 429 with `Retry-After`                                                             |
| **A-10** | Jobs: BullMQ setup, queues (`ledger`, `notifications`, `documents`, `rails`, `scheduler`), base processor, retry/backoff/DLQ, Bull Board mounted behind admin auth                                                                          | A-03       | `apps/api/src/modules/jobs/**`                                                 | A failing job lands in the DLQ after N attempts and is replayable                                        |
| **A-11** | Files: upload (multipart, magic-byte sniffing, size/type allowlist), **Cloudinary** adapter behind a `MediaStoragePort` (signed uploads, private delivery for KYC docs, on-the-fly transforms), virus-scan port (sim), expiring signed URLs | A-03       | `apps/api/src/modules/files/**`                                                | A `.exe` renamed `.pdf` is rejected on content, not extension; KYC assets are never publicly addressable |
| **A-12** | Observability: `/health` (liveness, readiness, Mongo, Redis), Prometheus metrics, request timing, OpenAPI/Swagger generated from contracts                                                                                                  | A-02       | `apps/api/src/modules/health/**`, `apps/api/src/openapi/**`                    | `/docs` renders the full spec; readiness fails when Mongo is down                                        |

### WS-B · Ledger & Accounts (the core; highest bar)

| ID       | Task                                                                                                                                                                      | Depends          | Owns                                   | Acceptance                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| **B-01** | Ledger domain (framework-free): `JournalEntry`, `Posting`, `LedgerAccount`, balancing invariant, `PostingBuilder`, entry-type catalogue                                   | F-03             | `apps/api/src/domain/ledger/**`        | 100% coverage; an unbalanced entry cannot be constructed                     |
| **B-02** | Ledger infra: schemas w/ `$jsonSchema` validators, repositories, `PostingService.post()` inside a transaction, balance projection update, replay/rebuild command          | B-01, A-03       | `apps/api/src/modules/ledger/**`       | `pnpm ledger:verify` rebuilds 10k entries and matches every balance          |
| **B-03** | Chart of accounts: seed the GL in §3.2, admin CRUD (guarded), trial balance query                                                                                         | B-02             | `apps/api/src/modules/gl/**`           | Trial balance sums to zero on seeded data                                    |
| **B-04** | Accounts: open (per product rules), number + IBAN + check-digit generation, types (current/savings/joint/wallet), nickname, freeze/close with balance guards, dormancy    | B-02, C-01       | `apps/api/src/modules/accounts/**`     | Cannot close an account with a non-zero balance or an open hold              |
| **B-05** | Balances & holds: available vs ledger, place/release/capture/expire hold, overdraft buffer, minimum balance, TTL expiry job                                               | B-04             | `apps/api/src/modules/holds/**`        | `available = ledger − holds + overdraft`, proven under concurrency           |
| **B-06** | Transactions: projection from journal entries, merchant enrichment, auto-categorisation, search (text + facets), running balance, CSV/OFX export, receipt PDF             | B-02             | `apps/api/src/modules/transactions/**` | Cursor pagination stable across concurrent inserts                           |
| **B-07** | Statements: monthly generation job, PDF renderer (branded, opening/closing balance, per-line), on-demand range, e-statement archive, proof-of-balance & reference letters | B-06, A-10, A-11 | `apps/api/src/modules/statements/**`   | Statement closing balance == ledger balance at period end, to the minor unit |
| **B-08** | Interest engine: daily accrual (savings credit, overdraft/loan debit), day-count conventions, monthly capitalisation, tiered rates, posts real journal entries            | B-02, A-10       | `apps/api/src/modules/interest/**`     | 365 simulated days on a tiered account matches a hand-computed fixture       |
| **B-09** | Fees engine: schedule-driven (maintenance, ATM, intl, late, FX markup), waivers by tier, pro-rating, all fees post to GL 4000                                             | B-02, C-01       | `apps/api/src/modules/fees/**`         | Fee income in the GL == sum of fee transactions                              |

### WS-C · Products, Pricing & FX

| ID       | Task                                                                                                                                                                                | Depends    | Owns                               | Acceptance                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------- | ----------------------------------------------------------------------- |
| **C-01** | Product catalogue: account/card/loan/deposit products, eligibility rules, fee schedules, rate tables, limit matrices, versioning with effective dates                               | A-03       | `apps/api/src/modules/products/**` | Changing a product version does not retro-alter existing accounts       |
| **C-02** | Limits engine: per-product/tier/channel daily+monthly+per-txn caps, KYC-tier caps, cumulative counters w/ TZ-correct reset, admin override with expiry                              | C-01, B-05 | `apps/api/src/modules/limits/**`   | Hitting a daily cap returns `LIMIT_EXCEEDED` with remaining allowance   |
| **C-03** | FX: rate provider port + simulated feed (random-walk w/ volatility), bid/ask spread by tier, quote → lock (TTL) → execute, cross-currency journal entries, spread income to GL 4200 | B-02, C-01 | `apps/api/src/modules/fx/**`       | An expired quote cannot execute; conversion balances in both currencies |
| **C-04** | Multi-currency wallets: open per currency, convert between own wallets, per-currency balances, consolidated net worth in base currency                                              | C-03, B-04 | `apps/api/src/modules/wallets/**`  | Net worth recomputes when rates move                                    |

### WS-D · Movement of money (transfers, payments, rails)

| ID       | Task                                                                                                                                                                                 | Depends          | Owns                                                                             | Acceptance                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **D-01** | Rail ports + simulator kernel: `PaymentRailPort`, deterministic sim engine (configurable latency, failure rate, cut-off windows, settlement batches), seeded RNG for reproducibility | A-10             | `apps/api/src/rails/kernel/**`, `apps/api/src/rails/ports/**`                    | Same seed → identical outcomes; failure injection is config-driven              |
| **D-02** | Internal transfer: own→own and Reliance→Reliance (by account no / @tag / email), instant, one journal entry, limits + holds + fees applied                                           | B-05, C-02, A-08 | `apps/api/src/modules/transfers/internal/**`                                     | Sender debit and receiver credit are one atomic entry; no interim state visible |
| **D-03** | Domestic rail (ACH/RTGS sim): pending → submitted → settled/returned, batch cut-offs, R-codes for returns, reversal entries, tracking timeline                                       | D-01, D-02       | `apps/api/src/modules/transfers/domestic/**`, `apps/api/src/rails/ach/**`        | A returned payment reverses cleanly and notifies the customer                   |
| **D-04** | International rail (SWIFT sim): IBAN/BIC/SWIFT validation, correspondent hops, OUR/SHA/BEN charges, FX quote binding, MT103-style tracker, compliance hold                           | D-01, C-03       | `apps/api/src/modules/transfers/international/**`, `apps/api/src/rails/swift/**` | Invalid IBAN checksum rejected pre-debit; charges land on the right party       |
| **D-05** | Beneficiaries: CRUD, validation per corridor, name-check (Confirmation-of-Payee sim), trust levels, 24h cooling-off for new payees, favourites, bulk import                          | A-04             | `apps/api/src/modules/beneficiaries/**`                                          | A brand-new payee above threshold triggers cooling-off + step-up                |
| **D-06** | Scheduled & recurring: future-dated, standing orders (daily/weekly/monthly/custom RRULE), retry on insufficient funds, pause/skip/cancel, next-run preview                           | D-02, A-10       | `apps/api/src/modules/transfer-orders/**`                                        | Month-end rules (31st in February) resolve correctly                            |
| **D-07** | Bulk & payroll: CSV upload → validate → preview → approve → execute, per-row status, partial failure handling, downloadable result                                                   | D-02, A-11       | `apps/api/src/modules/bulk-transfers/**`                                         | A 500-row file with 3 bad rows executes 497 and reports 3 precisely             |
| **D-08** | Bill pay & top-up: biller directory, account-number validation per biller, airtime/data/utility/TV, instant vs scheduled, biller rail sim w/ failures + auto-refund                  | D-01, C-01       | `apps/api/src/modules/bill-pay/**`, `apps/api/src/rails/biller/**`               | A failed biller call auto-reverses the debit within the same job                |
| **D-09** | Request money & split: request link, QR payload, accept/decline/expire, split-bill across N contacts, nudges                                                                         | D-02             | `apps/api/src/modules/payment-requests/**`                                       | An expired request cannot be paid                                               |
| **D-10** | Direct debits & mandates: mandate creation, merchant collection sim, customer cancel, dispute→refund path                                                                            | D-01, B-05       | `apps/api/src/modules/mandates/**`                                               | Cancelling a mandate blocks the next collection                                 |

### WS-E · Cards

| ID       | Task                                                                                                                                                                                | Depends          | Owns                                                                                | Acceptance                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **E-01** | Card issuing: virtual instant + physical (order→print→ship→deliver sim), PAN tokenisation (PAN never stored raw; last4 + token only), BIN config, expiry, CVV reveal behind step-up | B-04, A-05       | `apps/api/src/modules/cards/issuing/**`                                             | Raw PAN appears in zero logs, zero DB fields — test greps the codebase   |
| **E-02** | Card lifecycle: activate, set/change PIN (hashed, never retrievable), freeze/unfreeze, replace, report lost/stolen w/ auto-reissue, expire, cancel                                  | E-01             | `apps/api/src/modules/cards/lifecycle/**`                                           | A frozen card declines with `CARD_FROZEN` at authorisation               |
| **E-03** | Card controls: per-channel toggles (online/contactless/ATM/international/magstripe), per-txn + daily limits, merchant-category blocklist, geo rules                                 | E-02, C-02       | `apps/api/src/modules/cards/controls/**`                                            | Each control has an authorisation test proving decline                   |
| **E-04** | Card network sim: authorisation → hold, partial/incremental auth, capture, clearing, settlement batch, reversal, refund, 3DS challenge flow, decline reason codes                   | D-01, E-03, B-05 | `apps/api/src/rails/card-network/**`, `apps/api/src/modules/cards/authorisation/**` | Auth places a hold; capture converts it to a posting; expiry releases it |
| **E-05** | Card statements, spend analytics by MCC, virtual card per-merchant lock, subscription detection                                                                                     | E-04, B-06       | `apps/api/src/modules/cards/insights/**`                                            | Recurring Netflix-style charges are auto-detected as a subscription      |

### WS-F · Credit (loans, overdrafts, deposits, savings)

| ID        | Task                                                                                                                                                                           | Depends     | Owns                                        | Acceptance                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| **F1-01** | Loan products & eligibility: personal/auto/mortgage/SME, affordability calc, DTI, indicative offers, calculator API                                                            | C-01        | `apps/api/src/modules/loans/products/**`    | Eligibility is pure + unit-tested against a fixture matrix                |
| **F1-02** | Loan application: multi-step, document requirements, credit-score sim (deterministic from profile), decision engine (auto-approve/refer/decline), offer + acceptance           | F1-01, A-11 | `apps/api/src/modules/loans/application/**` | A referred application lands in the admin underwriting queue              |
| **F1-03** | Loan servicing: disbursement (journal entry to GL 1200), amortisation schedule generation, repayment allocation (fees→interest→principal), early payoff w/ rebate, restructure | F1-02, B-02 | `apps/api/src/modules/loans/servicing/**`   | Schedule totals reconcile to the cent; final instalment absorbs rounding  |
| **F1-04** | Arrears & collections: missed-payment detection, late fees, DPD buckets, provisioning entries, write-off, collections queue, payment plans                                     | F1-03, A-10 | `apps/api/src/modules/loans/collections/**` | 30/60/90 DPD transitions fire on the simulated clock                      |
| **F1-05** | Overdraft facility: request, limit assignment, utilisation tracking, daily interest, auto-sweep repayment                                                                      | F1-01, B-08 | `apps/api/src/modules/overdraft/**`         | Available balance includes the overdraft only when the facility is active |
| **F1-06** | Fixed/term deposits: rate table by tenor, create (debit current → credit deposit GL), maturity job, auto-rollover, early withdrawal penalty                                    | B-08, C-01  | `apps/api/src/modules/deposits/**`          | Early break recalculates interest at the penalty rate and claws back      |
| **F1-07** | Savings goals & vaults: create goal, target + deadline, manual/auto contributions, round-up rule engine, sweep rules, progress projection, withdraw                            | B-04, A-10  | `apps/api/src/modules/savings-goals/**`     | Round-ups accumulate from card spend and post as real transfers           |

### WS-G · Risk, Compliance & Support

| ID       | Task                                                                                                                                                                                     | Depends    | Owns                                | Acceptance                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| **G-01** | KYC/onboarding: tiered levels (0–3) with limits, personal + address + employment + source-of-funds, ID document upload, OCR sim, liveness/selfie sim, decision workflow, re-KYC expiry   | A-11, C-02 | `apps/api/src/modules/kyc/**`       | Tier 0 cannot transfer above the tier-0 cap; upgrading lifts limits immediately |
| **G-02** | Screening: sanctions/PEP/adverse-media list sim, fuzzy name matching w/ score, hits→review queue, ongoing rescreening job                                                                | G-01, A-10 | `apps/api/src/modules/screening/**` | A near-match on a seeded sanctions name blocks onboarding for review            |
| **G-03** | AML rules engine: declarative rules (velocity, structuring, round-amount, dormant-then-active, high-risk corridor, threshold aggregation), scoring, alert generation, tunable thresholds | B-06, A-10 | `apps/api/src/modules/aml/rules/**` | Ten €9,900 transfers in a day raise a structuring alert                         |
| **G-04** | Case management: alert→case, assignment, SLA, investigation notes, evidence attachment, disposition, SAR draft + file (sim), regulatory export                                           | G-03       | `apps/api/src/modules/aml/cases/**` | Case lifecycle is fully audited; SLA breach escalates                           |
| **G-05** | Fraud: real-time transaction scoring, device/IP/geo-velocity signals, step-up challenge, block + customer alert, false-positive feedback loop, fraud-report intake                       | E-04, A-05 | `apps/api/src/modules/fraud/**`     | An impossible-travel card auth triggers a challenge, not a silent decline       |
| **G-06** | Disputes & chargebacks: raise dispute, reason codes, provisional credit, evidence exchange, merchant response sim, representment, arbitration, final outcome + reversal entries          | B-06, E-04 | `apps/api/src/modules/disputes/**`  | Provisional credit posts and reverses correctly on a lost dispute               |
| **G-07** | Support: tickets, threaded secure messages, attachments, categories, SLA/priority, CSAT, canned responses, agent assignment, in-app chat transport (SSE)                                 | A-04, A-11 | `apps/api/src/modules/support/**`   | Customer and agent see the same thread in real time                             |

### WS-H · Communications & Content

| ID       | Task                                                                                                                                                                                                                         | Depends    | Owns                                              | Acceptance                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **H-01** | Notification core: event bus → template → channel fan-out, per-user preference matrix, in-app centre, read/unread, digest batching, quiet hours                                                                              | A-10       | `apps/api/src/modules/notifications/**`           | Muting "marketing" never suppresses a security alert                               |
| **H-02** | Channel adapters: email via **Resend** (React Email templates, batch send, webhook ingest for delivered/bounced/complained), SMS sim, web push (VAPID), SSE stream for live in-app; delivery log + retry                     | H-01       | `apps/api/src/modules/notifications/channels/**`  | A bounced email is recorded from the Resend webhook and marks the address degraded |
| **H-03** | Template library: 40+ branded **React Email** templates (welcome, verify, OTP, login-alert, transfer sent/received, low balance, card auth, statement ready, loan decision, dispute update, …) sharing one Outfit-set layout | H-02       | `apps/api/src/modules/notifications/templates/**` | Every template renders with fixture data and passes an HTML-email lint             |
| **H-04** | CMS: pages, blog posts, FAQs, rates page, fee schedule, branch/ATM directory w/ geo query, banners, legal docs; draft/publish/schedule + preview tokens                                                                      | A-06       | `apps/api/src/modules/cms/**`                     | Marketing site renders entirely from CMS data; ISR revalidates on publish          |
| **H-05** | Public API: rates, FX board, branch/ATM locator, biller directory, lead capture, newsletter, calculators — all unauthenticated, cached, rate-limited                                                                         | H-04, C-03 | `apps/api/src/modules/public/**`                  | Fully cacheable; no auth path reachable from these routes                          |

### WS-I · Design System & Marketing site

| ID       | Task                                                                                                                                                                                                    | Depends    | Owns                                                              | Acceptance                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| **I-01** | `packages/ui` foundation: token pipeline (`brand.tokens.json` → CSS vars + Tailwind theme), dark mode, typography, `cn()`, icon set, motion primitives                                                  | F-02       | `packages/ui/src/foundation/**`, `packages/ui/tailwind-preset.ts` | Zero hard-coded hex outside the token file                            |
| **I-02** | `packages/ui` primitives: Button, Input, Select, Combobox, Checkbox, Radio, Switch, Textarea, OTPInput, DatePicker, CurrencyInput, FileDrop, Form (RHF+zod) — all a11y, all keyboard                    | I-01       | `packages/ui/src/primitives/**`                                   | Axe clean; every component has a story + a11y test                    |
| **I-03** | `packages/ui` composites: Card, Table (sortable/virtual), DataGrid, Tabs, Dialog, Drawer, Sheet, Toast, Tooltip, Popover, Menu, Pagination, EmptyState, Skeleton, ErrorState, Stepper, Badge, Avatar    | I-02       | `packages/ui/src/composites/**`                                   | Storybook builds; no component file > 250 lines                       |
| **I-04** | `packages/ui` banking components: MoneyText (tabular, currency-aware, red/green), BalanceCard, TransactionRow, AccountCard, CardArt, StatusPill, LimitMeter, AmortisationTable, LedgerBadge, RateTicker | I-02, F-03 | `packages/ui/src/banking/**`                                      | `MoneyText` never renders a float; negative amounts styled per §Brand |
| **I-05** | `packages/ui` charts: spend-by-category donut, cashflow bars, balance-over-time area, sparkline, rate line — themed, accessible, responsive                                                             | I-01       | `packages/ui/src/charts/**`                                       | Colour-blind safe; every chart has a table fallback                   |
| **I-06** | Marketing shell: Next 16 app, layout, header w/ mega-menu, footer, cookie banner, SEO (metadata, OG, sitemap, robots, JSON-LD), analytics hook, i18n scaffold                                           | I-01, F-06 | `apps/web-marketing/{app/layout,components/shell}/**`             | Lighthouse ≥ 95 across the board on the shell                         |
| **I-07** | Marketing — Home + Personal: hero, product grid, trust/security band, testimonials, app showcase, CTA funnel; Personal banking, Current accounts, Savings, Cards pages                                  | I-06, H-05 | `apps/web-marketing/app/(marketing)/**`                           | Content 100% from CMS; renders with an empty CMS without crashing     |
| **I-08** | Marketing — Business + Borrow: SME accounts, payroll, invoicing, merchant services; Loans, Mortgages, Overdrafts + interactive calculators                                                              | I-07       | `apps/web-marketing/app/(business)/**`, `app/(borrow)/**`         | Calculators match the API's amortisation output exactly               |
| **I-09** | Marketing — Trust & Utility: Security centre, Fraud awareness, Rates & fees, Branch/ATM locator (map + search), Help centre + FAQ search, Contact, About, Careers, Press, Legal, Accessibility, Status  | I-06, H-05 | `apps/web-marketing/app/(trust)/**`, `app/(company)/**`           | Locator geo-search returns nearest 10 with distance                   |
| **I-10** | Marketing — Blog/Insights + Open-an-account funnel: article list/detail/category/author, RSS; multi-step funnel that hands off to the client-app signup with state                                      | I-07       | `apps/web-marketing/app/(insights)/**`, `app/open-account/**`     | Funnel state survives the cross-app handoff                           |

### WS-J · Client dashboard

| ID       | Task                                                                                                                                                                                                                                                      | Depends                | Owns                                                           | Acceptance                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **J-01** | App shell: Next 16, auth-aware layout, BFF route handlers (cookie forwarding, CSRF), sidebar + mobile nav, command palette, theme, session-expiry handling, error/loading boundaries                                                                      | I-03, F-06             | `apps/web-client/{app/layout,lib/server,components/shell}/**`  | 401 refreshes silently once, then routes to login preserving the target |
| **J-02** | Auth screens: login (+2FA, +passkey), register, email verify, phone OTP, forgot/reset, device-trust prompt, lockout messaging, step-up modal                                                                                                              | J-01                   | `apps/web-client/app/(auth)/**`                                | Every failure state has real copy — no raw error codes surfaced         |
| **J-03** | Onboarding/KYC wizard: progress stepper, personal, address, employment, source of funds, ID capture + preview, selfie, review, submit, status tracker, resume-where-left-off                                                                              | J-02, G-01             | `apps/web-client/app/(onboarding)/**`                          | Refreshing mid-wizard resumes at the same step with data intact         |
| **J-04** | Dashboard home: net worth, account cards carousel, quick actions, recent activity, spend snapshot, upcoming bills, insights, goals progress, alerts                                                                                                       | J-01, I-04, I-05       | `apps/web-client/app/(app)/dashboard/**`                       | Fully skeleton-loaded; no layout shift (CLS ≈ 0)                        |
| **J-05** | Accounts: list, detail (balance, IBAN copy, nickname), transaction list w/ infinite scroll + filters + search, transaction detail + receipt, export, open new account, close, statements                                                                  | J-04, B-06             | `apps/web-client/app/(app)/accounts/**`                        | Filters are URL state; a shared link reproduces the exact view          |
| **J-06** | Transfers: unified flow (own / Reliance / domestic / international), amount + FX quote w/ live countdown, fee + arrival preview, review, step-up, confirmation, share receipt, repeat                                                                     | J-05, D-02→D-04        | `apps/web-client/app/(app)/transfers/**`                       | Quote expiry visibly re-quotes; the user cannot submit a stale rate     |
| **J-07** | Payees & scheduled: beneficiary CRUD, name-check result UI, cooling-off notice, standing orders list/create/edit/skip/cancel, calendar view, bulk CSV upload wizard                                                                                       | J-06, D-05→D-07        | `apps/web-client/app/(app)/payees/**`, `.../scheduled/**`      | CSV wizard shows per-row validation before anything executes            |
| **J-08** | Bills & top-up: biller catalogue w/ search, saved billers, pay flow, airtime/data, receipts, request money, split bill, QR scan/generate, mandates list                                                                                                   | J-06, D-08→D-10        | `apps/web-client/app/(app)/payments/**`                        | QR round-trips: generated payload scans back to the same request        |
| **J-09** | Cards: card wall w/ CardArt, order virtual/physical, activate, reveal details behind step-up, freeze toggle, PIN, controls (channels/limits/geo), transactions, report lost, replace                                                                      | J-04, E-01→E-05        | `apps/web-client/app/(app)/cards/**`                           | Reveal requires step-up every time; details auto-hide after 30s         |
| **J-10** | Save & invest: savings goals CRUD + progress rings, round-up settings, auto-save rules, vaults, fixed deposits (rate table, create, maturity, break), interest earned view                                                                                | J-04, F1-06, F1-07     | `apps/web-client/app/(app)/save/**`                            | Break-deposit shows the exact penalty before confirming                 |
| **J-11** | Borrow: eligibility check, calculator, application wizard, document upload, status tracker, offer accept, active loans, amortisation schedule, repay, early payoff quote, overdraft                                                                       | J-04, F1-01→F1-05      | `apps/web-client/app/(app)/borrow/**`                          | Schedule UI matches the API row-for-row                                 |
| **J-12** | FX & wallets: currency wallets, convert flow w/ locked quote, rate board, rate alerts, multi-currency net worth                                                                                                                                           | J-04, C-03, C-04       | `apps/web-client/app/(app)/wallets/**`                         | Conversion confirmation shows rate, spread and exact received amount    |
| **J-13** | Insights & analytics: spend by category, month-over-month, merchant leaderboard, budgets w/ alerts, cashflow forecast, subscription tracker, exportable                                                                                                   | J-05, I-05             | `apps/web-client/app/(app)/insights/**`                        | Category totals reconcile to the transaction list, to the minor unit    |
| **J-14** | Notifications & support: notification centre, filters, preferences matrix, ticket list/create/thread w/ attachments, live chat (SSE), dispute a transaction, report fraud, FAQ inline                                                                     | J-01, G-06, G-07, H-01 | `apps/web-client/app/(app)/support/**`, `.../notifications/**` | New in-app notification arrives without a page refresh                  |
| **J-15** | Profile & settings: personal info, address change (re-KYC trigger), contact, password, 2FA, passkeys, devices, sessions, transaction PIN, limits view + increase request, privacy, marketing prefs, language, currency, theme, data export, close account | J-01, A-05             | `apps/web-client/app/(app)/settings/**`                        | Every destructive action is confirm + step-up gated                     |
| **J-16** | Business banking: entity profile, team members + roles, maker/checker approval inbox, sub-accounts, bulk payroll, invoice create/send/track, merchant QR & settlement                                                                                     | J-01, D-07, A-06       | `apps/web-client/app/(business)/**`                            | A payment above the approver threshold cannot execute on one signature  |
| **J-17** | PWA + polish: installable manifest, offline shell, web push registration, skeletons everywhere, empty states, a11y sweep (WCAG 2.2 AA), reduced-motion, i18n extraction                                                                                   | J-04                   | `apps/web-client/{public,app/manifest.ts,lib/pwa}/**`          | Axe clean on every route; keyboard-only journey completes a transfer    |

### WS-K · Admin console

| ID       | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Depends           | Owns                                         | Acceptance                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **K-01** | Admin shell + auth: login, mandatory TOTP, IP allowlist notice, role-aware nav, permission-gated rendering, global search, audit banner ("you are viewing customer data")                                                                                                                                                                                                                                                                                       | I-03, A-06        | `apps/web-admin/{app/layout,app/(auth)}/**`  | A permission the role lacks is not rendered _and_ the route 403s                                                                |
| **K-02** | Ops overview: KPI tiles (customers, deposits, volumes, revenue), live transaction feed, queue depths, rail health, alerts summary, system status                                                                                                                                                                                                                                                                                                                | K-01, A-12        | `apps/web-admin/app/(ops)/overview/**`       | Feed streams via SSE; degrades gracefully to polling                                                                            |
| **K-03** | Customer 360: search, profile, KYC status, accounts + balances, transaction history, cards, loans, devices/sessions, tickets, alerts, notes, timeline; freeze/unfreeze, force logout, read-only impersonation (fully audited)                                                                                                                                                                                                                                   | K-01, G-01        | `apps/web-admin/app/(customers)/**`          | Impersonation writes an audit event and is visibly banner-flagged                                                               |
| **K-04** | KYC & screening queues: review workstation, document viewer w/ zoom, checklist, approve/reject/request-more, tier assignment, screening hits w/ match scores, bulk actions, SLA timers                                                                                                                                                                                                                                                                          | K-03, G-02        | `apps/web-admin/app/(compliance)/kyc/**`     | Reject requires a reason code + free text; customer is notified                                                                 |
| **K-05** | Transaction ops: advanced search, journal-entry inspector (shows both sides), holds management, manual credit/debit under **dual approval**, reversal, bulk ops, reconciliation workbench                                                                                                                                                                                                                                                                       | K-01, B-02        | `apps/web-admin/app/(ops)/transactions/**`   | A manual posting requires two distinct admins; the initiator cannot approve                                                     |
| **K-06** | AML & fraud console: alert queue w/ triage, case workspace, rule editor + backtest, threshold tuning, watchlists, SAR builder, fraud rules, false-positive marking                                                                                                                                                                                                                                                                                              | K-01, G-03→G-05   | `apps/web-admin/app/(compliance)/aml/**`     | Backtesting a rule change reports how many historical alerts it would raise                                                     |
| **K-07** | Disputes & chargebacks console: queue, evidence viewer, provisional credit control, representment, outcome, timeline                                                                                                                                                                                                                                                                                                                                            | K-01, G-06        | `apps/web-admin/app/(ops)/disputes/**`       | Every state transition posts the correct ledger entry                                                                           |
| **K-08** | Card ops: card search, issue/block/reissue, BIN config, authorisation log w/ decline reasons, network sim controls, dispute linkage                                                                                                                                                                                                                                                                                                                             | K-01, E-01→E-04   | `apps/web-admin/app/(ops)/cards/**`          | Decline reasons are human-readable, not raw codes                                                                               |
| **K-09** | Lending ops: application queue, underwriting workstation (score, affordability, documents), approve/decline/counter-offer, disbursement, arrears dashboard, collections, write-off, payment plans                                                                                                                                                                                                                                                               | K-01, F1-02→F1-04 | `apps/web-admin/app/(lending)/**`            | Decision requires a rationale; the applicant sees a plain-English outcome                                                       |
| **K-10** | Product & pricing studio: product CRUD, fee schedules, rate tables, limit matrices, eligibility rules, effective-dating, preview impact, publish                                                                                                                                                                                                                                                                                                                | K-01, C-01        | `apps/web-admin/app/(products)/**`           | Publishing shows an impact summary before it commits                                                                            |
| **K-11** | CMS studio: pages, blocks, blog, FAQs, branches/ATMs, banners, legal docs; media library, draft→review→publish, scheduled publish, live preview, revision history + rollback                                                                                                                                                                                                                                                                                    | K-01, H-04        | `apps/web-admin/app/(content)/**`            | Rollback restores an exact prior revision                                                                                       |
| **K-12** | Comms studio: template editor w/ live preview + test send, campaign builder, audience segments, broadcast, delivery analytics                                                                                                                                                                                                                                                                                                                                   | K-01, H-03        | `apps/web-admin/app/(comms)/**`              | Test send renders with real fixture data across email + SMS + push                                                              |
| **K-13** | Support console: ticket queue, SLA board, agent assignment, thread view, canned responses, live chat console, CSAT, escalation                                                                                                                                                                                                                                                                                                                                  | K-01, G-07        | `apps/web-admin/app/(support)/**`            | Agent and customer threads stay in sync in real time                                                                            |
| **K-14** | Finance & reporting: trial balance, GL explorer, P&L, balance sheet, deposit/loan books, fee & FX income, reconciliation reports, regulatory exports, scheduled reports, report builder                                                                                                                                                                                                                                                                         | K-01, B-03        | `apps/web-admin/app/(finance)/**`            | Trial balance renders zero-sum on live data; export matches on-screen                                                           |
| **K-15** | Platform admin: staff users + roles + permission matrix, audit-log explorer w/ chain verification, feature flags, maintenance mode, queue/job monitor + replay, webhooks, API keys                                                                                                                                                                                                                                                                              | K-01, A-07, A-10  | `apps/web-admin/app/(platform)/**`           | Audit explorer flags any broken hash link in red                                                                                |
| **K-16** | **Operations Control** — the back-office batch console. Business-date management, on-demand batch runs (interest accrual, settlement, statement generation, arrears assessment), counterparty rail health and latency configuration, FX rate administration, treasury funding of the clearing account, scheduled-run presets, and restore-to-checkpoint. Named and worded as the operational tooling a bank genuinely runs (§4.6) — never as a simulation panel | K-01, L-02        | `apps/web-admin/app/(operations-control)/**` | Advancing the business date 30 days produces correct interest, statements and arrears; no label on any screen says "simulation" |

### WS-L · Data, Simulation & Realism

| ID       | Task                                                                                                                                                                                                                                                                               | Depends                | Owns                                            | Acceptance                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **L-01** | Seed foundation: GL chart, currencies, products, fee schedules, rate tables, billers, branches/ATMs, CMS content, admin roles + users, feature flags                                                                                                                               | B-03, C-01             | `apps/api/src/seed/foundation/**`               | `pnpm seed:foundation` is idempotent — rerunning changes nothing                                                  |
| **L-02** | Simulation engine: `ClockService` offset store, scenario runner, deterministic RNG, chaos config, snapshot/restore of the whole DB                                                                                                                                                 | A-02, A-03             | `apps/api/src/modules/simulation/**`            | Restoring a snapshot reproduces balances byte-for-byte                                                            |
| **L-03** | Synthetic personas + history: 60 customers across archetypes (student, salaried, freelancer, SME, high-net-worth, dormant, fraudster, defaulter), each with 12–24 months of _plausible_ transaction history generated through the real ledger APIs                                 | L-01, L-02, D-02, E-04 | `apps/api/src/seed/personas/**`                 | Generated history passes `pnpm ledger:verify` with zero drift                                                     |
| **L-04** | Merchant & category data: 400+ merchants w/ MCC, logos, geo; realistic amount distributions, recurring subscriptions, salary cycles, weekend/holiday patterns                                                                                                                      | L-03                   | `apps/api/src/seed/merchants/**`                | Spend charts look like a real person's, not uniform noise                                                         |
| **L-05** | Showcase dataset: one-command `pnpm demo:reset` → clean DB + full personas + credentials printed **to the terminal**. The word "demo" appears in the CLI and docs only — never in the product, and the seeded customers are ordinary-looking people, not `demo@…` addresses (§4.6) | L-03, L-04             | `apps/api/src/seed/demo/**`, `docs/SHOWCASE.md` | Fresh clone → `pnpm demo` → working bank in under 5 minutes, with no on-screen indication of how it was populated |

### WS-M · Quality, CI & Delivery

| ID       | Task                                                                                                                                                                        | Depends        | Owns                                               | Acceptance                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| **M-01** | Unit test infrastructure + domain coverage gate at 100% for `domain/` and `packages/money`                                                                                  | F-07           | `apps/api/jest.config.ts`, `apps/api/test/unit/**` | CI fails if domain coverage drops below 100%                          |
| **M-02** | API integration suite: supertest + real Mongo RS per suite, auth fixtures, every endpoint in §7 has a happy path + auth failure + validation failure + idempotency test     | A-_, B-_, D-\* | `apps/api/test/integration/**`                     | ≥ 80% overall line coverage                                           |
| **M-03** | Ledger property & invariant tests: fast-check property tests, concurrency stress (500 parallel transfers), invariant verifier in CI                                         | B-02           | `apps/api/test/ledger/**`                          | 500 concurrent transfers leave the book balanced with no lost updates |
| **M-04** | E2E (Playwright): customer journeys — signup→KYC→open account→fund→transfer→card→statement; admin journeys — KYC approval, manual posting dual-approval, dispute resolution | J-_, K-_       | `e2e/**`                                           | Runs against the seeded demo DB in CI on every PR                     |
| **M-05** | Security testing: authz matrix test (every role × every endpoint), IDOR probes, rate-limit tests, PII/secret leak scan, dependency audit, OWASP-ASVS checklist              | A-06, M-02     | `apps/api/test/security/**`, `docs/SECURITY.md`    | No role can read another customer's data via any route                |
| **M-06** | CI/CD: GitHub Actions — install/cache, lint, typecheck, unit, integration (Mongo service), build, e2e, Sonar-equivalent quality gate, preview deploy                        | F-01           | `infra/ci/**`, `.github/workflows/**`              | PR is blocked on any red check                                        |
| **M-07** | Performance: k6 load scripts (transfer, dashboard, transaction list), index audit, N+1 detection, p95 budgets                                                               | M-02           | `perf/**`                                          | Transfer p95 < 250ms at 100 rps locally                               |
| **M-08** | Docs: README, ARCHITECTURE, DOMAIN-GLOSSARY, API guide, RUNBOOK, ONBOARDING, ADR log, CHANGELOG-AGENTS                                                                      | — (any time)   | `docs/**`, `README.md`                             | A new agent can go from clone to first PR using docs alone            |

---

## 7. API surface (contract for F-04)

All routes prefixed `/v1`. `🔒` = authenticated, `👑` = admin + permission, `⚡` = requires
`Idempotency-Key`, `🔐` = requires step-up auth.

| Area              | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Auth**          | `POST /auth/register` · `POST /auth/verify-email` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` 🔒 · `POST /auth/forgot-password` · `POST /auth/reset-password` · `GET /auth/me` 🔒                                                                                                                                                                                                                                                                                                                   |
| **MFA / devices** | `POST /mfa/totp/enrol` 🔒 · `POST /mfa/totp/verify` 🔒 · `DELETE /mfa/totp` 🔒🔐 · `GET /mfa/recovery-codes` 🔒🔐 · `POST /mfa/passkeys/*` 🔒 · `GET /devices` 🔒 · `DELETE /devices/:id` 🔒 · `GET /sessions` 🔒 · `DELETE /sessions/:id` 🔒                                                                                                                                                                                                                                                                             |
| **Profile / KYC** | `GET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | PATCH /profile`🔒 ·`POST /kyc/start`🔒 ·`PATCH /kyc/:step`🔒 ·`POST /kyc/documents`🔒 ·`POST /kyc/submit`🔒 ·`GET /kyc/status` 🔒                                                                                                                                                   |
| **Accounts**      | `GET /accounts` 🔒 · `POST /accounts` 🔒⚡ · `GET /accounts/:id` 🔒 · `PATCH /accounts/:id` 🔒 · `POST /accounts/:id/close` 🔒🔐 · `GET /accounts/:id/balance` 🔒 · `GET /accounts/:id/statements` 🔒 · `POST /accounts/:id/statements` 🔒                                                                                                                                                                                                                                                                                |
| **Transactions**  | `GET /transactions` 🔒 · `GET /transactions/:id` 🔒 · `GET /transactions/export` 🔒 · `GET /transactions/:id/receipt` 🔒 · `GET /insights/spend` 🔒 · `GET /insights/cashflow` 🔒 · `GET                                                                                                                                                                                                                                                                                                                                  | POST /budgets` 🔒                                                                                                                                                                                                                                                                   |
| **Transfers**     | `POST /transfers/internal` 🔒⚡ · `POST /transfers/domestic` 🔒⚡🔐 · `POST /transfers/international` 🔒⚡🔐 · `POST /transfers/quote` 🔒 · `GET /transfers/:id` 🔒 · `POST /transfers/:id/cancel` 🔒                                                                                                                                                                                                                                                                                                                     |
| **Beneficiaries** | `GET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | POST /beneficiaries`🔒 ·`PATCH                                                                                                                                                                                                                                                      | DELETE /beneficiaries/:id`🔒 ·`POST /beneficiaries/verify-name` 🔒                                                           |
| **Scheduled**     | `GET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | POST /transfer-orders`🔒⚡ ·`PATCH                                                                                                                                                                                                                                                  | DELETE /transfer-orders/:id`🔒 ·`POST /transfer-orders/:id/skip`🔒 ·`POST /bulk-transfers`🔒⚡ ·`GET /bulk-transfers/:id` 🔒 |
| **Payments**      | `GET /billers` · `POST /bill-payments` 🔒⚡ · `POST /topups` 🔒⚡ · `GET                                                                                                                                                                                                                                                                                                                                                                                                                                                  | POST /payment-requests`🔒 ·`POST /payment-requests/:id/pay`🔒⚡ ·`GET                                                                                                                                                                                                               | DELETE /mandates` 🔒                                                                                                         |
| **Cards**         | `GET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | POST /cards`🔒⚡ ·`GET /cards/:id`🔒 ·`POST /cards/:id/activate`🔒 ·`POST /cards/:id/freeze`🔒 ·`POST /cards/:id/unfreeze`🔒 ·`GET /cards/:id/sensitive`🔒🔐 ·`PUT /cards/:id/pin`🔒🔐 ·`PATCH /cards/:id/controls`🔒 ·`POST /cards/:id/report`🔒 ·`GET /cards/:id/transactions` 🔒 |
| **Save**          | `GET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | POST /savings-goals`🔒 ·`PATCH                                                                                                                                                                                                                                                      | DELETE /savings-goals/:id`🔒 ·`POST /savings-goals/:id/contribute`🔒⚡ ·`GET                                                 | POST /deposits`🔒⚡ ·`POST /deposits/:id/break`🔒🔐 ·`GET /deposits/rates` |
| **Borrow**        | `GET /loans/products` · `POST /loans/eligibility` 🔒 · `POST /loans/calculate` · `GET                                                                                                                                                                                                                                                                                                                                                                                                                                     | POST /loans/applications`🔒 ·`PATCH /loans/applications/:id`🔒 ·`POST /loans/applications/:id/accept`🔒🔐 ·`GET /loans`🔒 ·`GET /loans/:id/schedule`🔒 ·`POST /loans/:id/repay`🔒⚡ ·`GET /loans/:id/payoff-quote`🔒 ·`POST /overdraft/request` 🔒                                  |
| **FX / wallets**  | `GET /fx/rates` · `POST /fx/quote` 🔒 · `POST /fx/convert` 🔒⚡ · `GET                                                                                                                                                                                                                                                                                                                                                                                                                                                    | POST /wallets`🔒 ·`GET                                                                                                                                                                                                                                                              | POST /fx/alerts` 🔒                                                                                                          |
| **Notifications** | `GET /notifications` 🔒 · `POST /notifications/read` 🔒 · `GET                                                                                                                                                                                                                                                                                                                                                                                                                                                            | PATCH /notifications/preferences`🔒 ·`GET /notifications/stream`🔒 (SSE) ·`POST /push/subscribe` 🔒                                                                                                                                                                                 |
| **Support**       | `GET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | POST /tickets`🔒 ·`GET /tickets/:id`🔒 ·`POST /tickets/:id/messages`🔒 ·`POST /disputes`🔒 ·`GET /disputes/:id`🔒 ·`POST /disputes/:id/evidence`🔒 ·`POST /fraud-reports` 🔒                                                                                                        |
| **Business**      | `GET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | POST /business/members`🔒 ·`GET /business/approvals`🔒 ·`POST /business/approvals/:id/decide`🔒🔐 ·`GET                                                                                                                                                                             | POST /business/invoices`🔒 ·`POST /business/payroll` 🔒⚡🔐                                                                  |
| **Public**        | `GET /public/rates` · `GET /public/fx-board` · `GET /public/branches` · `GET /public/atms` · `GET /public/pages/:slug` · `GET /public/posts` · `GET /public/faqs` · `POST /public/leads` · `POST /public/newsletter` · `GET /public/fees`                                                                                                                                                                                                                                                                                 |
| **Admin**         | `/admin/customers` · `/admin/kyc` · `/admin/screening` · `/admin/accounts` · `/admin/transactions` · `/admin/journal-entries` · `/admin/manual-postings` (dual approval) · `/admin/holds` · `/admin/aml/{alerts,cases,rules}` · `/admin/fraud` · `/admin/disputes` · `/admin/cards` · `/admin/loans` · `/admin/products` · `/admin/cms/*` · `/admin/comms/*` · `/admin/tickets` · `/admin/reports/*` · `/admin/users` · `/admin/roles` · `/admin/audit` · `/admin/flags` · `/admin/jobs` · `/admin/simulation/*` — all 👑 |
| **System**        | `GET /health` · `GET /health/ready` · `GET /metrics` · `GET /docs`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## 8. Environment

`.env.example` is the contract. Config is zod-validated at boot; a missing or malformed var **fails
startup loudly** rather than defaulting silently.

```
NODE_ENV · PORT · API_URL · WEB_CLIENT_URL · WEB_ADMIN_URL · WEB_MARKETING_URL
MONGODB_URI (replica set) · MONGODB_DB
REDIS_URL
JWT_ACCESS_SECRET · JWT_REFRESH_SECRET · JWT_ACCESS_TTL · JWT_REFRESH_TTL
COOKIE_DOMAIN · COOKIE_SECURE · CSRF_SECRET
ARGON2_MEMORY · ARGON2_TIME · ARGON2_PARALLELISM
ENCRYPTION_KEY (AES-256-GCM, at-rest field encryption)
CLOUDINARY_CLOUD_NAME · CLOUDINARY_API_KEY · CLOUDINARY_API_SECRET · CLOUDINARY_UPLOAD_FOLDER
RESEND_API_KEY · RESEND_WEBHOOK_SECRET · MAIL_FROM · MAIL_REPLY_TO
VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY
BANK_CODE · BANK_BIC · BANK_COUNTRY · BASE_CURRENCY · SUPPORTED_CURRENCIES
SIM_CLOCK_ENABLED · SIM_RAIL_FAILURE_RATE · SIM_RAIL_LATENCY_MS · SIM_SEED
FEATURE_INVESTMENTS · FEATURE_BUSINESS_BANKING · FEATURE_CRYPTO
LOG_LEVEL · SENTRY_DSN
```

**Never** commit a real secret. `.env.example` holds placeholders only. A pre-commit secret scan is
active in this repo and will block you.

---

## 9. Risk register (Kessler's list)

| #   | Risk                                                                    | Mitigation                                                                                         | Owner task |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **Balance drift** — projections diverge from postings                   | Rebuild-and-diff verifier in CI + nightly; balances only ever written by `PostingService`          | B-02, M-03 |
| 2   | **Lost update under concurrency** — two transfers read the same balance | All money paths run in a Mongo transaction with the retry runner; optimistic version on `accounts` | A-03, M-03 |
| 3   | **Float contamination**                                                 | `Money` VO + ESLint `no-float-money` + `bigint` at rest; zero `number` money fields                | F-03, F-02 |
| 4   | **Mongo without a replica set** — transactions silently unavailable     | Compose auto-inits `rs0`; boot check refuses to start otherwise                                    | F-05, A-01 |
| 5   | **Contract churn stalls frontends**                                     | Contracts frozen in Phase 0; additive-only; mocks regenerate with the contract                     | F-04, §4.3 |
| 6   | **Agents colliding on files**                                           | Exclusive `Owns:` globs; Handoff Notes instead of cross-edits                                      | §4         |
| 7   | **Idempotency gaps** → duplicate money                                  | `@Idempotent()` mandatory on every ⚡ route; integration test per route                            | A-08, M-02 |
| 8   | **Someone "just uses `new Date()`"** and time-travel breaks             | `ClockService` only; ESLint bans `new Date()` in `apps/api/src`                                    | A-02, F-02 |
| 9   | **A simulated bank still holds real PII**                               | Field-level AES-GCM on PII, redacted logs, synthetic-only seed data                                | A-11, L-03 |
| 10  | **Admin power without accountability**                                  | Every admin read of customer data is audited; dual approval on manual postings                     | A-07, K-05 |

---

## 10. Suggested parallel allocation

Once Phase 0 lands, these lanes have no shared files and can all run at once:

| Lane              | Workstreams | Notes                                                        |
| ----------------- | ----------- | ------------------------------------------------------------ |
| 1 · Platform      | WS-A        | Unblocks every other backend lane; start first               |
| 2 · Ledger        | WS-B, WS-C  | The critical path. Highest quality bar. Best agent goes here |
| 3 · Movement      | WS-D        | Needs B-05 + C-02; stub them behind ports until ready        |
| 4 · Cards         | WS-E        | Independent after B-05                                       |
| 5 · Credit        | WS-F        | Independent after B-02 + C-01                                |
| 6 · Risk          | WS-G        | Consumes events; can build against fixtures                  |
| 7 · Comms/CMS     | WS-H        | Fully independent                                            |
| 8 · Design system | WS-I 01–05  | Zero backend dependency — start on day 1                     |
| 9 · Marketing     | WS-I 06–10  | Needs I-01..03 + mocks                                       |
| 10 · Client app   | WS-J        | Needs I-03 + mocks; **not** the backend                      |
| 11 · Admin app    | WS-K        | Needs I-03 + mocks; read §4.6 before writing a line of copy  |
| 12 · Data/Sim     | WS-L        | Needs B + D to generate history; L-01 can start early        |
| 13 · Quality      | WS-M        | M-08 immediately; the rest trails each lane                  |

**Critical path:** `F-01 → F-02 → F-04 → A-01 → A-03 → B-01 → B-02 → B-04 → D-02 → L-03 → M-04`.
Everything else is slack. Protect that path.

---

## 11. Definition of "the platform is finished"

- [ ] `git clone && pnpm i && pnpm demo` → a fully populated bank in under 5 minutes
- [ ] A customer can sign up, pass KYC, open an account, receive salary, spend on a card, transfer
      internationally, take a loan, save into a goal, dispute a charge and download a statement —
      end to end, in the browser
- [ ] An operator can approve KYC, investigate an AML alert, resolve a dispute, make a dual-approved
      manual posting, publish a marketing page and run a month-end close — end to end
- [ ] The trial balance is zero-sum, and `pnpm ledger:verify` reproduces every balance from postings
- [ ] Advancing the simulated clock by a year produces correct interest, statements, arrears and
      fees
- [ ] `pnpm verify` green · coverage ≥ 80% (100% domain) · Playwright suites green · zero criticals
- [ ] No real money has moved, and no real PII exists in the database
- [ ] **No rendered page, email or error message anywhere discloses that this is a simulation**
      (§4.6). Verified by an automated copy scan in CI, not by eye

---

_Reliance Bank · agent_plan.md · v1.0 · Amend via PR; log every amendment in
`docs/CHANGELOG-AGENTS.md`._
