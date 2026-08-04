# Runbook

Operating the Reliance Bank stack locally: starting, stopping, verifying, and recovering. This is a
local-development runbook — there is no production deployment. Commands run from the repo root
unless stated otherwise.

---

## Daily operations

### Start everything

```bash
pnpm db:up                      # MongoDB replica set (rs0, :27317) + Redis (:6579)
pnpm --filter @reliance/api dev # API on :4400 with watch + source maps
```

First boot of Mongo initiates the replica set automatically via the compose healthcheck; give it
~15s. Confirm readiness:

```bash
curl -s http://localhost:4400/v1/health/ready
# ready → {"data":{"status":"ready","checks":{"database":{"status":"up","detail":"replica set rs0, primary"}}}}
```

The front ends (planned) run at :3000 / :3001 / :3002 via `pnpm dev` (all apps) or
`pnpm --filter <app> dev`.

### Stop

```bash
pnpm db:down    # stops containers, keeps volumes (data survives)
```

### Reset to empty

```bash
pnpm db:reset   # down -v && up — DESTROYS all local data
```

### Full demo (planned — L-05)

```bash
pnpm demo   # db:up + seed a fully populated bank + run all apps
```

Prints demo credentials on completion. Target: clone → working bank in under 5 minutes.

## Verification commands

| Command              | What it proves                                                           | Status                                                                                       |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm verify`        | lint + typecheck + test + build green across every package               | ✅ the CI gate                                                                               |
| `pnpm ledger:verify` | Rebuilds every balance from postings and diffs — any drift is a defect   | verifier service built (B-02); CLI entry not yet wired to the script                         |
| `pnpm audit:verify`  | Walks the audit hash chain; a tampered record breaks a link and is named | command built (A-07); script repoint to `dist/modules/audit/verify-audit.command.js` pending |
| `pnpm db:logs`       | Follows Mongo + Redis container logs                                     | ✅                                                                                           |

Run `pnpm ledger:verify` after any change to ledger persistence, seed generation, or rail
simulators. Drift is never a rounding artefact — treat any diff as a bug in the write path.

## Health and diagnostics

- `GET /v1/health` — liveness. Reports environment, uptime, and both **simulated** and real time
  plus the clock offset. A large offset is the first thing to check when "interest didn't run" or
  "everything is dated next month".
- `GET /v1/health/ready` — readiness. Only reports ready when MongoDB is a **writable replica-set
  primary**; "connected" alone is not sufficient for a system that lives on multi-document
  transactions.
- API logs are pino JSON (pretty-printed in dev), `traceId` on every line. A client error response
  carries the same `traceId` — grep it to find the full request story.
- mongo-express (browse the ledger):
  `docker compose -f infra/docker/docker-compose.yml --profile tools up -d` → http://localhost:8481.
  Development convenience only.

## Common failures

### API refuses to become ready: "not a replica set — transactions unavailable"

The Mongo container was started outside this compose file, or its data volume predates the
replica-set config. Fix:

```bash
pnpm db:reset
docker exec rb-mongo mongosh --quiet --eval 'db.hello().setName'   # expect: rs0
```

If `setName` is empty, initiate manually:
`docker exec rb-mongo mongosh --port 27317 --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27317'}]})"`.
The advertised host **must** match the published port — see the next entry for why.

### Every Mongo write takes ~8–15 seconds

**Fixed on 2026-08-03. If you are seeing this, your containers predate the fix — run
`pnpm db:reset`.**

The cause was worth recording. A replica set advertises its members by the `host:port` given to
`rs.initiate()`, and once `replicaSet=` is in the URI the driver dials that advertised address
directly. The compose file used to publish `27317:27017`, so the set advertised `localhost:27017` —
an address that, from the host, is either nothing or **a different project's MongoDB**. Every
operation burned the full 8s `serverSelectionTimeoutMS`. Measured: 5 writes in 77s, against 292ms
without replica-set topology.

`directConnection=true` masked it by skipping discovery, which is why it survived a working smoke
test. It has been removed — it contradicts `replicaSet=` anyway, one saying "talk to this node only"
and the other "discover the set".

The fix is that mongod now listens on and advertises **the same port it is published on**, so the
advertised address is reachable from both sides and cannot collide with another stack. Verify:

```bash
docker exec rb-mongo mongosh --port 27317 --quiet \
  --eval "print(JSON.stringify(rs.conf().members.map(m => m.host)))"
# ["localhost:27317"]   ← must match `docker port rb-mongo`
```

### API aborts at boot with a config error

Config is Zod-validated at startup — this is deliberate fail-fast, not a crash. The message names
the offending variable; compare `.env` against `.env.example` (the contract). Common cause:
`MONGODB_URI` missing `replicaSet=rs0`, or placeholder secrets (`replace-me-…`) where the schema
demands real entropy. Generate with `openssl rand -base64 48`.

### Port already in use (27317 / 6579 / 4400)

Another stack (or a previous run) holds the port. Ports are configurable via `MONGO_PORT`,
`REDIS_PORT`, `PORT` in `.env`; find the squatter with `lsof -i :27317`. `pnpm db:down` does not
kill an API started in another terminal.

### Emails "not sending" / uploads "not uploading"

Expected when `RESEND_API_KEY` / `CLOUDINARY_*` are unset: the API logs emails to stdout and fakes
uploads, and says so at boot (`RESEND_API_KEY is unset — emails will be logged, not sent`). Set the
keys in `.env` to use the real providers. No test or seed ever reaches them either way.

### Time is wrong / scheduled jobs fire at odd times

`SIM_CLOCK_ENABLED=true` in dev means the app reads the simulated clock, which can be offset from
real time. `GET /v1/health` shows `clockOffsetSeconds`. Reset the offset via the simulation controls
(planned — K-16/L-02) or restart with a clean database. Never enable the simulated clock anywhere a
human could mistake simulated state for real state.

### Ledger or audit verification fails

Stop. Do not "fix" the projection by hand. `pnpm ledger:verify` failing means a write bypassed the
ledger invariants — find the offending journal entry in the diff output and trace the code path that
wrote it. `pnpm audit:verify` failing means an audit record was mutated or deleted; the verifier
names the broken link.

### Write conflicts under load (`TransientTransactionError`)

The `TransactionRunner` retries these automatically; a retry storm means hot contention on one
document (usually a GL control account). Check for code paths updating accounts outside
`PostingService` — there should be none.

## Data safety rules

- Never run against a standalone MongoDB. If the URI doesn't name a replica set, the API will tell
  you — believe it.
- `pnpm db:reset` and anything `--volumes` destroys local data. There is no backup; seed data is
  reproducible from `SIM_SEED` (deterministic), so resetting is cheap by design.
- Local seed data is synthetic only. Do not put real personal data into this system — it is a
  simulation, and its security posture is not audited for real PII (see `README.md` disclaimer).
- Never commit a real secret. `.env.example` holds placeholders; a pre-commit scanner blocks
  real-looking secrets.
