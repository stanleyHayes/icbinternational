# Architecture decision log

Short entries. What was decided, what it rules out, and what would make us revisit it.

---

## ADR-001 · Double-entry ledger, not balance columns

**Decision.** Every movement of value is a balanced journal entry with at least two postings.
Account balances are a _projection_ rebuildable from the postings at any time.

**Why.** A balance column is a cache with no source of truth behind it. When it drifts — and under
concurrency it will — there is nothing to reconcile against and no way to answer "when did this go
wrong". Postings give us a replayable history, a trial balance that must sum to zero, and an
invariant CI can assert.

**Cost.** Every write is a multi-document transaction, which requires a replica set and makes the
write path slower than a single `$inc`.

**Revisit if.** Never for the ledger. Read-heavy projections may be denormalised further.

---

## ADR-002 · Integer minor units, never floats

**Decision.** Money is `bigint` minor units plus an ISO 4217 currency, wrapped in a `Money` value
object. A custom ESLint rule bans fractional literals, `parseFloat` and `toFixed` in banking code.

**Why.** `0.1 + 0.2 !== 0.3`. In a ledger that is not a curiosity, it is a defect that compounds
silently across millions of postings.

**Cost.** Amounts must be serialised as strings on the wire, and every rounding decision has to be
made explicitly.

---

## ADR-003 · TypeScript 7, with the TypeScript 6 compiler API scoped to the linter

**Decision.** The repo compiles with TypeScript 7 (the native compiler). `typescript-eslint` does
not yet support the TS 7 API, so `@reliance/config` depends on `@typescript/typescript6` aliased as
`typescript` — scoped to the lint package only.

**Why.** TS 7 was verified to emit `design:paramtypes`, so NestJS dependency injection works. The
alternative was staying a major version behind for the whole repo to satisfy one tool.

**Also ruled out.** `ts-jest` and the Nest CLI both drive the TS compiler API and fail on TS 7. Jest
transforms run through SWC instead, and the API builds with plain `tsc`. Type-checking is a separate
`tsc --noEmit` step, which is faster anyway.

**Revisit when.** `typescript-eslint` ships TS 7 support — then delete the alias.

---

## ADR-004 · Simulated rails, real providers for email and media

**Decision.** ACH, SWIFT, the card network, billers, SMS and the KYC vendor are in-house simulators.
Email (Resend) and media (Cloudinary) are real third parties behind `EmailSenderPort` and
`MediaStoragePort`.

**Why.** The banking rails are the thing being simulated — faking them is the point, and a simulator
we control can inject the failures a sandbox never would. Email and media are infrastructure, not
subject matter; using the real thing costs nothing and avoids building two things badly.

**Constraint.** No test, seed or CI run may reach either provider. Both ports have in-memory fakes,
and the API degrades to logging when the keys are unset.

---

## ADR-005 · Contracts-first, mock-first parallelism

**Decision.** `packages/contracts` is written before any feature work and frozen. `packages/mocks`
ships MSW handlers for the entire surface.

**Why.** It is the only mechanism that lets front-end and back-end work proceed genuinely in
parallel. Without it every UI task is blocked behind an API task, and the critical path becomes the
sum of both.

**Cost.** Contract changes need a protocol (`docs/CONTRACT_CHANGES.md`) and cost more than editing a
type in place.
