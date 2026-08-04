<p align="center">
  <img src="brand/logo/reliance-logo-horizontal.svg" alt="Reliance Bank" width="300">
</p>

<p align="center">
  A full-stack simulation of a licensed retail and SME bank.<br>
  <strong>No real money ever moves. Everything else behaves like it does.</strong>
</p>

---

## What this is

Reliance Bank is a working banking platform — marketing site, customer dashboard, operations console
and a core banking API — built around a real **double-entry ledger**. Accounts, cards, transfers,
FX, loans, KYC, AML, disputes and statements all behave the way a bank's do, including the parts
that are inconvenient: settlement windows, payment returns, chargebacks, arrears and month-end
close.

The only thing that is simulated is value crossing the bank's boundary. ACH, SWIFT, the card
network, billers and the KYC vendor are in-house simulators behind the same interfaces a real rail
would expose — with configurable latency, failure rates and cut-off times, so the failure paths get
exercised rather than assumed.

## Getting started

```bash
git clone <this repo> && cd reliancebank
pnpm install

cp .env.example .env          # fill in RESEND_API_KEY / CLOUDINARY_* if you want real
                              # email and uploads; both fall back to local fakes

pnpm db:up                    # MongoDB replica set + Redis in Docker
pnpm verify                   # lint · typecheck · test · build — must be green
pnpm --filter @reliance/api dev
```

The API comes up on **http://localhost:4400** with OpenAPI docs at `/docs`.

```bash
curl http://localhost:4400/v1/health/ready
# {"data":{"status":"ready","checks":{"database":{"status":"up","detail":"replica set rs0, primary"}}}}
```

> **MongoDB must be a replica set.** Multi-document transactions do not exist without one, and every
> movement of money here is a multi-document transaction. The compose file initiates a single-node
> set (`rs0`) automatically, and the API refuses to start against a standalone.

### Ports

Non-default on purpose, so this stack can run alongside others on the same machine.

| Service          | Port  |
| ---------------- | ----- |
| Core API         | 4400  |
| Marketing site   | 3000  |
| Client dashboard | 3001  |
| Admin console    | 3002  |
| MongoDB          | 27317 |
| Redis            | 6579  |

## Repository layout

```
apps/
  api/              NestJS core banking API — the ledger lives here
  web-marketing/    Public site
  web-client/       Customer dashboard
  web-admin/        Operations console
packages/
  contracts/    🔒  DTOs, Zod schemas, enums, route paths, error codes
  money/        🔒  Money value object — the only place arithmetic on money is legal
  ui/               Design system
  api-client/       Typed fetch client
  mocks/            MSW handlers, so front ends never wait for the backend
  config/           Shared TypeScript, ESLint and Jest configuration
infra/docker/       MongoDB replica set + Redis
brand/              Logo system and design tokens
agent_plan.md       The build plan — task board, ownership rules, acceptance criteria
```

🔒 = frozen after Phase 0; changes follow the Contract Change Protocol in `agent_plan.md` §4.3.

## Documentation

`docs/README.md` indexes the full set. The essentials:

- `docs/ONBOARDING.md` — clone to first PR, using docs alone
- `docs/ARCHITECTURE.md` — system shape, layering, the ledger
- `docs/API.md` — envelopes, errors, headers, idempotency, route map
- `docs/RUNBOOK.md` — operating the local stack; common failures
- `docs/SHOWCASE.md` — the generated dataset and how to rebuild it
- `docs/DOMAIN-GLOSSARY.md` — the vocabulary, binding definitions
- `docs/DECISIONS.md` — the ADR log

## The four rules

1. **Double-entry or it didn't happen.** No balance is ever written directly. Every movement is a
   balanced journal entry inside a transaction, and `pnpm ledger:verify` rebuilds every balance from
   the postings to prove no drift.
2. **Integer minor units.** Money is `bigint` minor units plus a currency, wrapped in `Money`.
   Floats are banned by a custom lint rule — `0.1 + 0.2` is not a risk this codebase takes.
3. **Time is injected.** Nothing calls `new Date()`. Everything reads `ClockService`, so the
   operations console can advance the clock a month and produce a real month of interest,
   statements, standing orders and arrears.
4. **Everything is audited.** State changes write an append-only, hash-chained audit event.
   Tampering with history breaks the chain and `pnpm audit:verify` says where.

## Commands

| Command                               | What it does                                                |
| ------------------------------------- | ----------------------------------------------------------- |
| `pnpm verify`                         | The gate: lint, typecheck, test, build across every package |
| `pnpm db:up` / `db:down` / `db:reset` | Local infrastructure                                        |
| `pnpm dev`                            | Every app in watch mode                                     |
| `pnpm demo`                           | Reset to a fully populated bank with demo customers         |
| `pnpm ledger:verify`                  | Rebuild every balance from postings and diff                |
| `pnpm audit:verify`                   | Verify the audit hash chain                                 |

## Deploying

Recommended split: **API on Render, front ends on Vercel**.

### Backend — Render

The repo ships a Render Blueprint (`render.yaml`) that defines the web service, build/start
commands, and every environment variable in one file.

1. In the Render dashboard → **New → Blueprint** → connect this repo.
2. Render detects `render.yaml` automatically and provisions the service.
3. Fill in every variable marked `sync: false` (secrets, URLs, connection strings).  
   See `.env.example` for descriptions of each.
4. Required external services — provision these before deploying:
   - **MongoDB** — [MongoDB Atlas](https://cloud.mongodb.com) M10 or above (replica set required).
   - **Redis** — Render's Redis service is provisioned automatically by the blueprint. If you prefer a different provider, set `REDIS_URL` manually.
5. After the first successful deploy, run the seed once to provision the admin account:
   ```
   render run --service reliance-api -- node apps/api/dist/seed/run-seed.js
   ```

### Front ends — Vercel

Each front end is a separate Vercel project. All three have `vercel.json` files that handle
the pnpm monorepo build automatically.

| App | Root Directory (set in Vercel) | Key env variables |
|-----|-------------------------------|-------------------|
| `apps/web-marketing` | `apps/web-marketing` | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` |
| `apps/web-client` | `apps/web-client` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` |
| `apps/web-admin` | `apps/web-admin` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CONSOLE_URL`, `API_ORIGIN` |

For each project:
1. In Vercel → **New Project** → import this repo → set **Root Directory** to the value above.
2. Vercel detects `vercel.json` and uses the monorepo-aware build commands automatically.
3. Add the environment variables for that app (see the table and `.env.example`).
4. Set `API_ORIGIN` on the admin console to the Render service URL so its BFF can reach the API
   via an internal/private path (keeps the API hostname out of the browser bundle).

## Quality bar

CI enforces what `agent_plan.md` §2.4 specifies: files ≤ 250 lines, functions ≤ 40, cyclomatic
complexity ≤ 10, cognitive complexity ≤ 15, no `any`, no magic values, no duplicated blocks, ≥ 80%
coverage overall and **100% on the money and ledger domain**. `eslint-plugin-sonarjs` plus two house
rules (`no-float-money`, `no-ambient-clock`) do the enforcing.

If a file trips `max-lines`, it has outgrown its single responsibility. Split it — don't raise the
limit.

## Contributing as an agent

`agent_plan.md` is the task board. Every task declares what it **owns** (path globs), what it
**depends on**, and its **acceptance criteria**. No two concurrently-runnable tasks own the same
file, so many agents can work at once without colliding.

```
1. Pick a task whose dependencies are ✅ DONE
2. Mark it 🔵 IN-PROGRESS with your agent id
3. Work only inside its `Owns:` paths
4. Meet every acceptance line, including tests
5. `pnpm verify` must be green
6. Mark ✅ DONE and append a line to docs/CHANGELOG-AGENTS.md
```

Need a change in a file you don't own? Don't edit it — open a note in `docs/HANDOFFS.md` and stub
the behaviour behind an interface so you stay unblocked.

## Licence & disclaimer

This is a simulation built for demonstration and education. It is not a licensed financial
institution, holds no real funds, and must not be used to process real payments or real personal
data.
