# Onboarding

From clone to first PR, using docs alone. Budget: about 30 minutes, mostly `pnpm install` and Docker
pulling images.

---

## 1. Prerequisites

| Tool   | Version               | Check            |
| ------ | --------------------- | ---------------- |
| Node   | ≥ 22 (`.nvmrc` pins)  | `node --version` |
| pnpm   | 11 (`packageManager`) | `pnpm --version` |
| Docker | any recent, running   | `docker info`    |
| Git    | —                     | —                |

`corepack enable` gives you the pinned pnpm. Nothing else is global — every other tool is a
workspace dependency.

## 2. Clone and install

```bash
git clone <this repo> && cd reliancebank
pnpm install
```

## 3. Environment

```bash
cp .env.example .env
```

The file is the contract — every variable is commented. For a first run you only need to replace the
placeholder secrets:

```bash
# JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CSRF_SECRET, ENCRYPTION_KEY
openssl rand -base64 48
```

Leave `RESEND_API_KEY` and `CLOUDINARY_*` empty: emails log to stdout and uploads use the local
fake. That is the intended local default — no test, seed or CI run may reach a real provider.

Config is Zod-validated at boot. A missing or malformed variable aborts startup with a readable
message naming the variable — that is deliberate, not a crash.

## 4. Infrastructure

```bash
pnpm db:up      # MongoDB 8 single-node replica set (rs0, :27317) + Redis 8 (:6579)
```

MongoDB **must** be a replica set — multi-document transactions do not exist without one, and every
movement of money is a multi-document transaction. The compose file initiates `rs0` automatically;
the API refuses to become ready against a standalone.

## 5. Prove the install

```bash
pnpm verify     # lint · typecheck · test · build — must be green
pnpm --filter @reliance/api dev
curl http://localhost:4400/v1/health/ready
# {"data":{"status":"ready","checks":{"database":{"status":"up","detail":"replica set rs0, primary"}}}}
```

Interactive API docs live at http://localhost:4400/docs.

If anything fails here, `docs/RUNBOOK.md` has a symptom-first failure table.

## 6. Learn the system (60 minutes, in order)

1. **This repo's README** — what Reliance Bank is and the four rules.
2. `docs/ARCHITECTURE.md` — system shape, layering, the ledger, what exists vs. planned.
3. `docs/DOMAIN-GLOSSARY.md` — the vocabulary. Debit/credit will bite you otherwise.
4. `docs/DECISIONS.md` — the ADR log. Five short entries; each says what it rules out.
5. `docs/API.md` — envelopes, errors, headers, idempotency, the route map.
6. Read the reference code: `packages/money/src/money.ts`,
   `apps/api/src/domain/ledger/journal-entry.ts`, `apps/api/src/common/errors/app-error.ts`. These
   three files teach the house style better than any document.

## 7. The rules you cannot break

Machine-enforced by lint — a violation fails CI, not just review:

- **Money** only through `@reliance/money` — `bigint` minor units, never floats. The
  `no-float-money` rule bans `parseFloat`, `toFixed` and fractional literals in banking code.
- **Time** only through `ClockService` — `new Date()` is banned in `apps/api/src`
  (`no-ambient-clock`). The simulator moves time; your code must move with it.
- **Errors** are `AppError` with a contract `ErrorCode` — never a raw `throw new Error`.
- **Validation** uses the Zod schemas from `@reliance/contracts`. Contracts and money are
  **frozen**: changes go through the Contract Change Protocol (`agent_plan.md` §4.3).
- **Layering**: controllers → services → domain → repositories, enforced by
  `import/no-restricted-paths`. Domain code imports nothing from Nest or Mongoose.
- **Quality bar** (`agent_plan.md` §2.4): files ≤ 250 lines (tests ≤ 400), functions ≤ 40 lines and
  ≤ 4 parameters, cyclomatic complexity ≤ 10, nesting ≤ 3, zero `any`, no magic values, TSDoc on
  every exported symbol, one concern per file.
- **Coverage**: ≥ 80% overall, **100%** on `domain/` and `packages/money`.
- Public IDs are prefixed ULIDs (`acc_01H…`). Dates are ISO-8601 UTC on the wire.
- New env vars go in `.env.example` **and** the config schema, or boot refuses them.

Naming: files `kebab-case.ts`, classes `PascalCase`, functions `camelCase`, constants
`SCREAMING_SNAKE`. Nest files carry their role: `*.controller.ts`, `*.service.ts`,
`*.repository.ts`, `*.schema.ts`, `*.use-case.ts`, `*.port.ts`, `*.rail.ts`.

## 8. Your first PR

This repo is built by many agents (and humans) in parallel, coordinated through `agent_plan.md`:

1. Pick a task whose `Depends` tasks are ✅ DONE. Check `Owns:` — you may edit **only** those globs.
2. Branch `feat/<TASK-ID>-<slug>`; Conventional Commits scoped to the task id
   (`feat(B-04): account opening use-case`). Never commit to `main`.
3. Need a change in a file you don't own? **Do not edit it.** Add a row to `docs/HANDOFFS.md`
   (`from → to :: file :: what's needed :: why`), stub the behaviour behind an interface, and keep
   moving.
4. Write tests: unit tests for domain logic, integration tests for any endpoint. Match the style of
   the nearest existing test.
5. `pnpm verify` green, then open the PR. Append one line to `docs/CHANGELOG-AGENTS.md`.

A good first task touches one module, adds one behaviour, and comes with tests. Browse the
workstream tables in `agent_plan.md` §5–§6 for anything marked unblocked.

## 9. Where things live (quick map)

| You want…                      | Where                             |
| ------------------------------ | --------------------------------- |
| Route paths, DTOs, error codes | `packages/contracts/src/`         |
| Money arithmetic               | `packages/money/src/`             |
| Ledger domain (framework-free) | `apps/api/src/domain/ledger/`     |
| AppError, envelope, clock, IDs | `apps/api/src/common/`            |
| DB connection, transactions    | `apps/api/src/database/`          |
| Feature modules                | `apps/api/src/modules/<area>/`    |
| API mocks for front ends       | `packages/mocks/src/`             |
| Test harness and builders      | `packages/testing/src/`           |
| Local infra                    | `infra/docker/docker-compose.yml` |
| Lint/TS/Jest presets           | `packages/config/`                |
| The build plan / task board    | `agent_plan.md`                   |
| This documentation set         | `docs/` (index: `docs/README.md`) |

## 10. Getting help

- Symptom → fix: `docs/RUNBOOK.md` ("Common failures").
- "Why is it like this?": `docs/DECISIONS.md`, then the plan's risk register (§9).
- Word you don't recognise: `docs/DOMAIN-GLOSSARY.md`.
- Blocked on another lane's file: `docs/HANDOFFS.md`.
- Proposing a contract change: `docs/CONTRACT_CHANGES.md` (additive only).
