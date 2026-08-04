# The showcase dataset

`pnpm demo:reset` rebuilds Reliance Bank from empty: reference data, eight customers, and between
one and two years of history each.

```bash
pnpm db:up          # MongoDB replica set + Redis
pnpm build          # the API must be compiled; the command runs from dist/
pnpm demo:reset
```

It prints the sign-in details when it finishes, and **exits non-zero if the ledger does not
verify**. That check is the point of the command, not a formality: a generated dataset renders
perfectly on every screen whether or not the book balances, so the only way to know is to replay
every posting and diff it.

## What it builds

| Customer                      | What they are for                                                      |
| ----------------------------- | ---------------------------------------------------------------------- |
| `amara.okonkwo@example.com`   | The default view. Salary in, steady spend, savings growing             |
| `ravi.chandran@example.com`   | Student. Thin margins, frequent small spend, near-zero balances        |
| `sofia.marchetti@example.com` | Freelancer. Irregular income and a EUR wallet — FX and lumpy cashflow  |
| `tom.whitfield@example.com`   | Family. 58 purchases a month over two years — the volume stress case   |
| `priya.raghavan@example.com`  | Business banking, multi-currency, larger amounts                       |
| `eileen.docherty@example.com` | Large savings balance. The only one that reaches the top interest tier |
| `callum.reid@example.com`     | Dormant for a year. What the dormancy job is supposed to find          |
| `lena.petrova@example.com`    | Registered, unverified. The KYC queue and every empty state            |

One password for all of them, printed by the command. It is a local fixture and appears nowhere a
customer could see it.

### Why these eight

A dataset of a hundred comfortable customers demonstrates one screen well and every other screen
badly. The arrears dashboard needs somebody in arrears; the AML queue needs somebody whose pattern
trips a rule; the empty states need an account with nothing in it. Build the awkward cases
deliberately, or discover during a demonstration that half the product has nothing to show.

## How the history is generated

**Through the real code.** Every movement is posted via `PostingService`, the same path a live
request takes. Writing balances straight into the accounts collection would be far faster and would
look identical on screen — until `pnpm ledger:verify` found a book that does not reconcile.

**Planned, then posted.** `history-plan.ts` turns a persona into a dated list of movements and is a
pure function; `persona-builder.service.ts` posts them. Keeping those separate means the generator
can be tested without a database, and when a history looks wrong the question _"did we plan it wrong
or post it wrong?"_ has an answer.

**Dated properly.** The simulated clock is moved to each movement's own date before it is posted, so
statements, interest accrual and the insights charts all see history that happened over time rather
than a heap of transactions with today's timestamp. The clock is reset afterwards — leaving it in
the past would make every later login and job happen last year.

**Funded honestly.** Opening balances are drawn from the external clearing account through
`entries.simulatedFunding`. Even generated money has to come from somewhere; crediting a customer
with no matching debit would break the trial balance on the first run.

### Realistic, not random

A 26-merchant directory with per-merchant amount ranges — a coffee is £2–£5, never £2–£400 — and
weights, so Tesco Express appears eleven times as often as Waitrose. Spend is biased toward
weekends. Subscriptions charge a fixed amount on a fixed day each month, which is the signal
subscription detection exists to find and which uniform random data would never produce.

The result is a spend chart with a shape. Uniform noise gives every category the same size, no
recurring charges and no weekly rhythm — and a dashboard built against that is never tested on the
thing it exists to show.

## Determinism

Seeded from `SIM_SEED` in `.env`. The same seed rebuilds byte-identical history.

This is not a nicety. A demonstration you cannot reproduce is one you cannot debug: _"the arrears
screen looked wrong on Tuesday"_ is unanswerable if Tuesday's data no longer exists. Change
`SIM_SEED` for a different bank; keep it to get the same one back.

`Math.random()` is not used anywhere in the generator.

## Resetting

The command is destructive. It clears the customer-derived collections — users, accounts, journal
entries, transactions, holds, transfers, audit events — and reseeds reference data. It names those
collections explicitly rather than dropping the database, because a wildcard would take the chart of
accounts with it and a ledger whose GL vanished mid-run fails in a way that looks like a code defect
rather than missing data.

GL balances are zeroed alongside, since they are a projection of postings that no longer exist.

## Extending it

Add an archetype to `PERSONAS` in `apps/api/src/seed/personas/persona-definitions.ts`. Give it a
`demonstrates` line saying what it exists to show — if you cannot write that line, the persona is
probably redundant with one already there.

Subscriptions are typed against the merchant directory, so a name that does not exist is a compile
error rather than a customer who silently ends up with one fewer recurring charge.
