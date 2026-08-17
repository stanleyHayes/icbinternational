# Contract change log

`packages/contracts` and `packages/money` are frozen after Phase 0. Every other workstream codes
against them, so an unannounced change breaks work that is already in flight.

## The protocol

1. Append a proposal below: what, why, and every task id affected.
2. **Prefer additive.** A new optional field or a new enum member breaks nobody.
3. Breaking? Bump the `contracts` minor version, list the consuming tasks, and set those task rows
   in `agent_plan.md` to 🟡 BLOCKED with the reason.
4. Regenerate `@reliance/api-client` and `@reliance/mocks` **in the same commit**. A contract whose
   client and mocks disagree with it is worse than no contract.

## Log

| Date       | Version | Change                                                                                                                                                                                                                                                                                      | Additive? | Affected tasks | Author |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------- | ------ |
| 2026-08-02 | 1.0.0   | Initial contract — 20 modules, full route map, error vocabulary                                                                                                                                                                                                                             | —         | all            | claude |
| 2026-08-02 | 1.0.1   | `mintFundsRequestSchema.narrative` default changed from `'Simulated inbound settlement'` to `'Credit transfer received'`. That string renders as the transaction description on a customer's statement and disclosed the nature of the project (§4.6). Default value only — no shape change | Yes       | none           | claude |
| 2026-08-17 | 1.1.0   | New module `chat.ts`: live support chat — conversation/message schemas, guest session, `chatStreamEventSchema` (WebSocket frames), and `routes.chat` / `routes.public.chat` / `routes.admin.chat` route maps. New id prefixes `cnv` / `cmsg`. Client and mocks regenerated in the same commit | Yes       | none           | kimi   |

## Open proposals

### F-06 · Routes in `routes` with no schema anywhere in the contract

**What.** Thirty-odd route constants exist in `common/routes.ts` with no request or response schema
in any module. `routes.business.*` is the largest gap — seven routes and no `modules/business.ts` at
all — followed by the signed-upload handshake, the async document jobs (statement/transaction/data
exports), the passkey ceremonies, the three financial reports beyond the trial balance,
reconciliation, screening hits, fraud rules, rule backtests, admin roles, comms templates and
campaigns, job runs, impersonation grants, step-up grants, `/public/rates`, the savings calculator,
and `/health`.

**Why it matters.** `@reliance/api-client` cannot type them and `@reliance/mocks` cannot generate
them, so the five UI lanes those routes serve would be blocked on a frozen file.

**Workaround in place.** `packages/api-client/src/provisional/` defines the missing item schemas and
exports them from the client's public API. `@reliance/mocks` imports them from there, so client and
mocks generate and validate against **one** definition rather than two. Each is a bare item schema
in the contract's own style, so promoting one is a file move plus an `export *` line — no call sites
change. See `packages/api-client/src/provisional/README.md`.

**Affected tasks.** F-06 (owner), and every lane consuming those routes: business banking, admin
reporting, admin platform, KYC uploads, marketing calculators.

### C-01 · `limitUsageSchema.limit` and `.remaining` should be nullable

**What.** Make `limit` and `remaining` in `limitUsageSchema` (`modules/products.ts`) nullable.

**Why.** `limitMatrixSchema` allows a dimension to cap the _number_ of movements per day
(`dailyCount`) without capping their total value (`daily: null`). The Everyday Current ATM limit is
the obvious case in the other direction, but a card-spend dimension capped only by count is a
perfectly ordinary configuration. `LimitUsage` cannot express it: `limit` is a required
`moneySchema`, and there is no honest money value for "uncapped". Substituting zero would tell the
customer they have no allowance at all, which is the opposite of the truth.

**Workaround in place.** `LimitsService.evaluate` returns an internal `LimitWindowUsage` whose
`limit` and `remaining` are `Money | null`, and `toLimitUsages` drops any window the contract cannot
express before it reaches the wire. Count-only windows are therefore enforced correctly —
`LIMIT_EXCEEDED` still fires — but are invisible to the client until the contract changes.

**Affected tasks.** C-01, C-02 (limits engine), J-\* (any dashboard limit meter).

### C-01 · No public route for a single product

**What.** Add `product: (code: string) => `/public/products/${code}``to`routes.public`.

**Why.** `routes.public.products` returns the whole catalogue. A statement that explains a fee, or a
marketing page for one account, needs one product resolved at a date — fetching all five and
filtering client-side is wasteful and makes the `asOf` semantics the client's problem.

**Workaround in place.** `ProductsController` derives the path from `routes.public.products` so the
two cannot drift. No client depends on it yet.

**Affected tasks.** C-01, I-\* (marketing site), H-\* (statements).

### B-04/B-05 · No customer-facing routes for holds, freeze/unfreeze, or an opening deposit

**What.** Three gaps in `common/routes.ts` and `modules/accounts.ts`:

1. **Holds have a schema but no route.** `holdSchema` and `HoldStatus`/`HoldReason` exist in
   `modules/ledger.ts`, and `routes.admin.holds` lists them for an operator, but a customer has no
   way to see why £42 of their balance is unspendable. Suggested addition: a `holds` entry under
   `routes.accounts` resolving to `/accounts/:id/holds`.
2. **No freeze/unfreeze route for an account.** `routes.cards.freeze` exists and
   `routes.admin.freezeCustomer` freezes a whole customer, but there is nothing between the two for
   a single account — which is what a customer who has lost their phone actually wants, and what a
   court order actually targets.
3. **`openAccountRequestSchema` carries no opening deposit.** Products with a positive
   `minOpeningBalance` (`RELIANCE_SAVER` at £1, `BUSINESS_CURRENT` at £100) cannot express the
   deposit that satisfies it, and there is nowhere to send money before the account exists.

**Why it matters.** (1) and (2) are missing surface, not wrong surface. (3) would otherwise make two
shipped products unopenable through the API.

**Workaround in place.** No contract change was needed and none was made.

- `HoldService.listActive(accountId)` and `toContractHold` are implemented and exported, so the
  route is a controller method away whenever the path exists.
- `AccountStatusService.freeze` / `.unfreeze` are implemented and exported for the admin and fraud
  lanes to call; only the customer-facing path is missing.
- The minimum opening balance is enforced by **status rather than by refusal**: an account on a
  product with a positive minimum opens `PENDING`, accepts credits, and is activated by the posting
  that reaches the minimum — inside the same transaction that books it. This is how a real bank does
  it, it needs no new request field, and it means the rule is enforced by the ledger rather than by
  a form.

**Affected tasks.** B-04, B-05 (owner), E-04 (card authorisations surface as holds), J-\* (dashboard
pending-transaction list), K-\* (admin account freeze).

### B-06 · Three additive gaps in the transactions and insights contract

All three are additive. Nothing below breaks an existing consumer, and the API works around each
locally today — these are recorded so the workarounds can be deleted rather than becoming permanent.

**1. `ID_PREFIX.budget` and `budgetSchema.id`.** `budgetSchema.id` is a bare `z.string()` and
`ID_PREFIX` has no `budget` entry, so `IdGenerator` cannot mint one. Every other public id in the
system is a prefixed ULID, and the prefix is what makes a stray id in a log or a bug report
self-describing. **Proposed:** add `budget: 'bdg'` to `ID_PREFIX` and tighten `budgetSchema.id` to
`entityId('bdg')`. _Workaround:_ `BudgetIdGenerator` in `apps/api/src/modules/insights/budget-id.ts`
mints `bdg_<ULID>` in the identical format, so stored ids already satisfy the tightened schema and
need no migration. Affected: B-06.

**2. Query schemas for the insights routes.** The contract defines every insights _response_ —
`spendByCategorySchema`, `cashflowSchema`, `subscriptionSchema`, `budgetSchema` — but no request
schema for any of the four `GET` routes, so the three front ends cannot validate an insights query
with the same schema the API does, which is the property the package exists to provide.
**Proposed:** add `spendQuerySchema`, `cashflowQuerySchema` (note: `accountId` **required** — a
closing balance belongs to an account, not a person) and `subscriptionQuerySchema`. _Workaround:_
declared locally in `apps/api/src/modules/insights/insights.dto.ts`, built from contract primitives.
Affected: B-06, J-\* (client dashboard).

**3. A receipt resource for `routes.transactions.receipt`.** The route exists in the map with no
schema anywhere. It currently answers `text/plain`. **Proposed:** either a `receiptSchema` resource,
or an explicit note in the route map that this endpoint returns a rendered document rather than JSON
— clients need to know which before they call it. Affected: B-06, J-\*. This overlaps the wider gap
F-06 already logged above.

### D-02/D-05 · Gaps found while implementing internal transfers and beneficiaries

Four gaps, all additive, none blocking. Each is worked around locally today and the workaround is a
re-export away from adopting the real thing.

**1. `FeeKind` has no `INTERNAL_TRANSFER` member.** `feeScheduleEntrySchema.kind` is an enum, so a
product version _cannot_ price an internal transfer at all — the catalogue has no vocabulary for it.
Internal transfers therefore come out free, which is the right default but should be a catalogue
decision rather than a hole in an enum. **Proposed:** add `INTERNAL_TRANSFER: 'INTERNAL_TRANSFER'`
to `FeeKind`. _Workaround:_ `feeKindFor()` in `apps/api/src/modules/transfers/transfer-rules.ts`
returns `null` for the internal rail and the pricing path treats that exactly as it treats a product
with no entry for the kind — no fee, no allowance consumed. The fee-booking code is shared with the
priced rails and is covered by its own test. Affected: D-02, D-03, D-04, C-01.

**2. `internalDestinationSchema` documents "exactly one of these" and does not enforce it.** All
four identifiers are `.optional()` with no `.refine()`, so a body naming both an email and somebody
else's account number parses cleanly and the server has to choose. **Proposed:** add `.refine()`
requiring exactly one of `accountId`, `accountNumber`, `email`, `handle`. _Workaround:_
`assertOneInternalIdentifier` in `apps/api/src/modules/beneficiaries/payee-resolver.service.ts`
rejects anything else with `VALIDATION_FAILED` before resolution. Silently preferring one identifier
would let a caller show the customer a confirmation screen for one payee and pay a different one.
Affected: D-02, D-05, J-\* (client dashboard cannot validate the form with the same rule).

**3. No request or response schema for `routes.beneficiaries.verifyName`, and no update shape for
`beneficiarySchema`.** The route exists in the map with nothing behind it, and there is no
`updateBeneficiaryRequestSchema`, so the three front ends cannot validate either call with the
definition the API uses. **Proposed:** add `verifyPayeeNameRequestSchema`
(`{ destination, accountName }`), `verifyPayeeNameResponseSchema`
(`{ result: NameCheckResult, suggestion: string | null }`) and `updateBeneficiaryRequestSchema`
(`{ nickname?, isFavourite? }`, at least one required). _Workaround:_ declared locally in
`apps/api/src/modules/beneficiaries/beneficiaries.dto.ts`, built from contract primitives. Affected:
D-05, J-\*.

**4. `transferEventSchema` is exported as a value but its inferred type is never named.** Every
other schema in the contract exports a companion `type`. **Proposed:** add
`export type TransferEvent = z.infer<typeof transferEventSchema>;`. _Workaround:_
`transfer-timeline.ts` derives it as `Transfer['timeline'][number]`, which stays pinned to the
contract rather than restating it. Affected: D-02, D-03, D-06, J-\*. | 2026-08-03 | 1.0.2 | Export
the inferred `ListTransfersQuery` type alongside `listTransfersQuerySchema`. The schema was exported
without its type, so consumers could validate a transfers query but not type one. Purely additive |
Yes | D-02 | claude | | 2026-08-03 | 1.1.0 | **Five additions:** `ID_PREFIX.budget`, `TransferEvent`
type, `FeeKind.INTERNAL_TRANSFER`, insights query schemas (`spendQuerySchema`, `cashflowQuerySchema`
with `accountId` required, `subscriptionQuerySchema`), and the beneficiary `verifyPayeeName`
request/response plus `updateBeneficiaryRequestSchema`. The transactions receipt route is now
documented as returning a rendered document rather than JSON | Yes | B-06, D-02, D-05, J-_ | claude
| | 2026-08-03 | 1.1.0 | **Two tightenings.** `budgetSchema.id` now requires a `bdg_` prefixed ULID
— safe, because `BudgetIdGenerator` already mints exactly that format, so no stored row needs
migrating. `internalDestinationSchema` now enforces the "exactly one of these" its own doc comment
had always promised; previously a body naming both an email and someone else's account number parsed
cleanly and the server picked one, which is how a caller shows a confirmation screen for one payee
and pays a different one | **No** | D-02, D-05, J-_ | claude | | 2026-08-03 | 1.1.1 | Added
`ID_PREFIX` entries for `loanApplication` (`lap`), `billPayment` (`bil`), `paymentRequest` (`prq`)
and `mandate` (`mdt`). Four lanes independently reported minting a borrowed prefix — loan
applications were issuing `qte_`, and bill payments, payment requests and mandates were all issuing
`tro_`. Harmless until someone greps a log for the wrong thing | Yes | WS-C/D, WS-F | claude |
