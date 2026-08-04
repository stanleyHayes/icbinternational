# API guide

How to call the Reliance Bank API and what to expect back. The authoritative definition of every
route, DTO and error code is `packages/contracts` — this guide explains the conventions that apply
to _all_ routes so individual endpoint docs only need to say what is special.

- Base URL (local): `http://localhost:4400/v1`
- Interactive docs: `http://localhost:4400/docs` (Swagger UI, non-production only)
- All routes are versioned under `/v1`. Route paths are constants in
  `packages/contracts/src/common/routes.ts` — never hardcode a path string in a client.

Legend for the route map below: `🔒` authenticated · `👑` admin + permission · `⚡` requires
`Idempotency-Key` · `🔐` requires step-up auth.

---

## Request conventions

**Headers the API understands** (constants in `@reliance/contracts`):

| Header            | Constant             | Purpose                                                   |
| ----------------- | -------------------- | --------------------------------------------------------- |
| `idempotency-key` | `IDEMPOTENCY_HEADER` | Required on every `⚡` mutation                           |
| `x-csrf-token`    | `CSRF_HEADER`        | Double-submit token on cookie-authenticated mutations     |
| `x-step-up-token` | `STEP_UP_HEADER`     | Proof of recent re-auth on `🔐` routes (5-minute window)  |
| `x-trace-id`      | `TRACE_HEADER`       | Client-supplied correlation id; echoed back and logged    |
| `Authorization`   | —                    | Bearer token for service-to-service; browsers use cookies |

**Content type.** JSON everywhere: `application/json`. Money on the wire is
`{ "amount": "1234", "currency": "GBP" }` with `amount` as a **string** of minor units — JSON
numbers cannot safely carry a `bigint`.

**Dates.** ISO-8601 UTC strings on the wire. Display time zones are a presentation concern.

**Validation.** Every body and query is validated against the Zod schema from contracts by
`ZodValidationPipe`. Failures return `VALIDATION_FAILED` with per-field detail.

## Response envelopes

Exactly two shapes. A client needs one response handler, not one per route.

Single resource:

```json
{ "data": { "id": "acc_01H…", "number": "049921 12345678" } }
```

Lists — cursor-paginated, always:

```json
{
  "data": [ … ],
  "page": { "cursor": "eyJ…", "limit": 25, "hasMore": true }
}
```

- `limit` defaults to 25, max 100 (`DEFAULT_PAGE_SIZE` / `MAX_PAGE_SIZE` in contracts).
- Pass `page.cursor` back as `?cursor=` for the next page; `hasMore: false` or a `null` cursor means
  the list is exhausted.
- Offset pagination exists only in admin exports. Cursors never skip or repeat rows under concurrent
  writes — offsets do.
- `total` is returned only where counting is cheap — never on the transaction feed.

## Errors

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "amount must be a positive integer number of minor units",
    "details": [{ "path": "amount", "message": "Expected string, received number" }],
    "traceId": "01J9Z…",
    "at": "2026-08-02T17:00:00.000Z",
    "retryAfterSeconds": 30
  }
}
```

- `code` is a member of the `ErrorCode` enum in `packages/contracts/src/common/error-codes.ts` — the
  complete vocabulary. Clients switch on `code`, never on `message`.
- `details` carries field-level failures for `VALIDATION_FAILED` and rule-specific detail otherwise.
- `traceId` correlates with server logs — quote it when reporting a bug.
- `retryAfterSeconds` appears on `RATE_LIMITED` (with a matching `Retry-After` header) and on
  transient rail failures.

Server-side, every error is an `AppError` mapped by the global exception filter — an uncaught
exception cannot leak a stack trace into this shape.

## Authentication (in flight — A-04/A-05)

Login sets the access token in an **httpOnly cookie** (`rb.at`); the token is never readable from
JavaScript. Mutations additionally require the CSRF double-submit header. Front ends do not call the
API directly from the browser for anything sensitive — their Next.js route handlers forward the
cookie and attach the CSRF token (BFF pattern).

Refresh tokens rotate; reuse of a rotated token revokes the whole session family. High-value
operations (`🔐`) require a **step-up**: a recent re-authentication (password, TOTP or passkey)
exchanged for a 5-minute `x-step-up-token`.

Admin endpoints (`👑`) require a staff session with the matching permission; staff TOTP is mandatory
and an IP allowlist applies.

## Idempotency

Implemented (A-08) in `apps/api/src/modules/idempotency/`; registration in `AppModule` is pending —
see `docs/HANDOFFS.md`.

Every `⚡` endpoint requires `Idempotency-Key`. The first request executes and its response is
stored; a replay with the same key and the same payload returns the stored response without
re-executing. The same key with a _different_ payload is an error — it means the client reused a key
by accident. Keys live 24 hours. Use a fresh ULID/UUID per logical operation, and reuse it only for
retries of that operation.

## Route map

The full surface as contracted in `agent_plan.md` §7. **Implemented today: the System routes and the
admin GL routes; auth is in flight.** Every other area is planned and already has frozen contracts,
DTOs and error codes in `packages/contracts/src/modules/`, plus a working mock in `packages/mocks`.

| Area              | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**          | `POST /auth/register` · `POST /auth/verify-email` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` 🔒 · `POST /auth/forgot-password` · `POST /auth/reset-password` · `GET /auth/me` 🔒                                                                                                                                                                                                                                                                                                                   |
| **MFA / devices** | `POST /mfa/totp/enrol` 🔒 · `POST /mfa/totp/verify` 🔒 · `DELETE /mfa/totp` 🔒🔐 · `GET /mfa/recovery-codes` 🔒🔐 · `POST /mfa/passkeys/*` 🔒 · `GET /devices` 🔒 · `DELETE /devices/:id` 🔒 · `GET /sessions` 🔒 · `DELETE /sessions/:id` 🔒                                                                                                                                                                                                                                                                             |
| **Profile / KYC** | `GET\|PATCH /profile` 🔒 · `POST /kyc/start` 🔒 · `PATCH /kyc/:step` 🔒 · `POST /kyc/documents` 🔒 · `POST /kyc/submit` 🔒 · `GET /kyc/status` 🔒                                                                                                                                                                                                                                                                                                                                                                         |
| **Accounts**      | `GET /accounts` 🔒 · `POST /accounts` 🔒⚡ · `GET /accounts/:id` 🔒 · `PATCH /accounts/:id` 🔒 · `POST /accounts/:id/close` 🔒🔐 · `GET /accounts/:id/balance` 🔒 · `GET\|POST /accounts/:id/statements` 🔒                                                                                                                                                                                                                                                                                                               |
| **Transactions**  | `GET /transactions` 🔒 · `GET /transactions/:id` 🔒 · `GET /transactions/export` 🔒 · `GET /transactions/:id/receipt` 🔒 · `GET /insights/spend` 🔒 · `GET /insights/cashflow` 🔒 · `GET\|POST /budgets` 🔒                                                                                                                                                                                                                                                                                                               |
| **Transfers**     | `POST /transfers/internal` 🔒⚡ · `POST /transfers/domestic` 🔒⚡🔐 · `POST /transfers/international` 🔒⚡🔐 · `POST /transfers/quote` 🔒 · `GET /transfers/:id` 🔒 · `POST /transfers/:id/cancel` 🔒                                                                                                                                                                                                                                                                                                                     |
| **Beneficiaries** | `GET\|POST /beneficiaries` 🔒 · `PATCH\|DELETE /beneficiaries/:id` 🔒 · `POST /beneficiaries/verify-name` 🔒                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Scheduled**     | `GET\|POST /transfer-orders` 🔒⚡ · `PATCH\|DELETE /transfer-orders/:id` 🔒 · `POST /transfer-orders/:id/skip` 🔒 · `POST /bulk-transfers` 🔒⚡ · `GET /bulk-transfers/:id` 🔒                                                                                                                                                                                                                                                                                                                                            |
| **Payments**      | `GET /billers` · `POST /bill-payments` 🔒⚡ · `POST /topups` 🔒⚡ · `GET\|POST /payment-requests` 🔒 · `POST /payment-requests/:id/pay` 🔒⚡ · `GET\|DELETE /mandates` 🔒                                                                                                                                                                                                                                                                                                                                                 |
| **Cards**         | `GET\|POST /cards` 🔒⚡ · `GET /cards/:id` 🔒 · `POST /cards/:id/activate` 🔒 · `POST /cards/:id/freeze` 🔒 · `POST /cards/:id/unfreeze` 🔒 · `GET /cards/:id/sensitive` 🔒🔐 · `PUT /cards/:id/pin` 🔒🔐 · `PATCH /cards/:id/controls` 🔒 · `POST /cards/:id/report` 🔒 · `GET /cards/:id/transactions` 🔒                                                                                                                                                                                                               |
| **Save**          | `GET\|POST /savings-goals` 🔒 · `PATCH\|DELETE /savings-goals/:id` 🔒 · `POST /savings-goals/:id/contribute` 🔒⚡ · `GET\|POST /deposits` 🔒⚡ · `POST /deposits/:id/break` 🔒🔐 · `GET /deposits/rates`                                                                                                                                                                                                                                                                                                                  |
| **Borrow**        | `GET /loans/products` · `POST /loans/eligibility` 🔒 · `POST /loans/calculate` · `GET\|POST /loans/applications` 🔒 · `PATCH /loans/applications/:id` 🔒 · `POST /loans/applications/:id/accept` 🔒🔐 · `GET /loans` 🔒 · `GET /loans/:id/schedule` 🔒 · `POST /loans/:id/repay` 🔒⚡ · `GET /loans/:id/payoff-quote` 🔒 · `POST /overdraft/request` 🔒                                                                                                                                                                   |
| **FX / wallets**  | `GET /fx/rates` · `POST /fx/quote` 🔒 · `POST /fx/convert` 🔒⚡ · `GET\|POST /wallets` 🔒 · `GET\|POST /fx/alerts` 🔒                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Notifications** | `GET /notifications` 🔒 · `POST /notifications/read` 🔒 · `GET\|PATCH /notifications/preferences` 🔒 · `GET /notifications/stream` 🔒 (SSE) · `POST /push/subscribe` 🔒                                                                                                                                                                                                                                                                                                                                                   |
| **Support**       | `GET\|POST /tickets` 🔒 · `GET /tickets/:id` 🔒 · `POST /tickets/:id/messages` 🔒 · `POST /disputes` 🔒 · `GET /disputes/:id` 🔒 · `POST /disputes/:id/evidence` 🔒 · `POST /fraud-reports` 🔒                                                                                                                                                                                                                                                                                                                            |
| **Business**      | `GET\|POST /business/members` 🔒 · `GET /business/approvals` 🔒 · `POST /business/approvals/:id/decide` 🔒🔐 · `GET\|POST /business/invoices` 🔒 · `POST /business/payroll` 🔒⚡🔐                                                                                                                                                                                                                                                                                                                                        |
| **Public**        | `GET /public/rates` · `GET /public/fx-board` · `GET /public/branches` · `GET /public/atms` · `GET /public/pages/:slug` · `GET /public/posts` · `GET /public/faqs` · `POST /public/leads` · `POST /public/newsletter` · `GET /public/fees`                                                                                                                                                                                                                                                                                 |
| **Admin**         | `/admin/customers` · `/admin/kyc` · `/admin/screening` · `/admin/accounts` · `/admin/transactions` · `/admin/journal-entries` · `/admin/manual-postings` (dual approval) · `/admin/holds` · `/admin/aml/{alerts,cases,rules}` · `/admin/fraud` · `/admin/disputes` · `/admin/cards` · `/admin/loans` · `/admin/products` · `/admin/cms/*` · `/admin/comms/*` · `/admin/tickets` · `/admin/reports/*` · `/admin/users` · `/admin/roles` · `/admin/audit` · `/admin/flags` · `/admin/jobs` · `/admin/simulation/*` — all 👑 |
| **System** ✅     | `GET /health` (liveness) · `GET /health/ready` (readiness — asserts a writable replica-set primary) · `GET /metrics` · `GET /docs`                                                                                                                                                                                                                                                                                                                                                                                        |

### Working examples (today)

```bash
# Liveness — process is up; reports both simulated and real time
curl http://localhost:4400/v1/health

# Readiness — fails unless MongoDB is a writable replica-set primary
curl http://localhost:4400/v1/health/ready
# {"data":{"status":"ready","checks":{"database":{"status":"up","detail":"replica set rs0, primary"}}}}
```

## Versioning and change policy

- One version, `/v1`. A breaking change to a route means `/v2`, not a changed `/v1`.
- The contracts package is frozen; changes follow the Contract Change Protocol (`agent_plan.md`
  §4.3): additive where at all possible, proposals logged in `docs/CONTRACT_CHANGES.md`, and
  `@reliance/api-client` + `@reliance/mocks` regenerated in the same commit.
- New error codes are additive by definition — add one to `ErrorCode` rather than overloading
  `message`.
