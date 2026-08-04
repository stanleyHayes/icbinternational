# Domain glossary

Banking vocabulary as this codebase uses it. Where the industry is ambiguous, the definition here is
the one that binds — if code and this file disagree, one of them is a bug.

---

## The ledger

**Journal entry** — the atomic unit of the ledger. A set of two or more postings whose debits equal
their credits, **per currency**. Immutable once written. A mistake is corrected by a new, opposing
entry, never by an edit.

**Posting** — one side of a journal entry: a GL account, a direction, and a positive amount. The
amount is _always_ positive; the direction carries the sign. Allowing negative debits would mean the
same movement could be written two ways, and a ledger you can express two ways is a ledger you can
reconcile two ways.

**Debit / credit** — sides, not good and bad. Debits increase assets and expenses; credits increase
liabilities, equity and income. A customer's account is a _liability_ of the bank — money it owes
them — so a **credit increases the customer's balance**. This is why a customer's "debit card
purchase" is a debit on our books and a reduction on theirs. `debitIncreases(type)` in
`chart-of-accounts.ts` is the single place this is encoded.

**GL account / chart of accounts** — the bank's internal accounts (`1000 Cash at Central Bank`,
`2000 Customer Deposits`, …). Every posting lands on one.

**Control account** — a GL account that aggregates many customer accounts, e.g.
`2000 Customer Deposits`. It is credited automatically as the counterparty of a customer posting and
must never be posted to directly by an operator.

**Trial balance** — total debits versus total credits across the whole book, per currency. It must
sum to zero. If it does not, something bypassed the ledger and the bank stops.

**Projection** — a derived, cached value. Account balances are projections of the postings.
`pnpm ledger:verify` rebuilds them from scratch and diffs; any difference is drift, and drift is a
defect, never a rounding artefact.

**Reversal** — an entry that mirrors another with every direction flipped. Balances by the same
construction the original did. History is never deleted.

**Value date vs booked-at** — `valueDate` is the accounting date (what a statement shows);
`bookedAt` is when we actually wrote it. They differ for back-valued items.

---

## Balances

**Ledger balance** — the sum of every posting against the account. What has been booked.

**Available balance** — what the customer can actually spend right now:

```
available = ledgerBalance − holdTotal + overdraftAvailable
```

**Hold** (also _authorisation_, _lien_) — value reserved but not yet posted. A card authorisation at
a petrol station places a hold; the capture, days later, converts it into a real posting. Holds
reduce _available_ without touching _ledger_.

**Capture** — converting a hold into a posting. **Release** — cancelling a hold without posting.
**Expiry** — a hold released automatically because the merchant never captured it.

---

## Money

**Minor units** — the smallest unit of a currency: pence, cents, satang. Stored as `bigint`. USD 2
places, JPY 0, KWD 3 — read the exponent from the currency table, never hardcode `100`.

**Basis point (bps)** — one hundredth of a percent. 25 bps = 0.25%. Every rate in the system is an
integer number of basis points, so no percentage is ever a float.

**Spread** — the difference between the mid-market rate and the rate the customer gets. It is the
bank's FX income, and it is always shown to the customer as a money amount, not hidden in the rate.

**Allocation** — splitting an amount so the parts sum exactly to the whole. £10 three ways is
`[3.34, 3.33, 3.33]`, never `[3.33, 3.33, 3.33]`.

---

## Movement

**Rail** — a payment network. Internal (inside Reliance), domestic ACH/RTGS, international SWIFT,
card network. All simulated, all behind a port interface.

**Settlement** — when value actually moves between institutions, usually in batches after a
**cut-off**. Between submission and settlement a payment is _in flight_ and sits in
`2150 Unsettled Outbound`.

**Return** — a payment the receiving bank sends back, carrying an R-code. Triggers a reversal.

**Nostro** — "our account with them". The bank's own account at another institution; where external
value enters and leaves the book.

**Idempotency key** — a client-supplied identifier making a retry safe. The same key with the same
payload returns the original response; the same key with a _different_ payload is an error, because
that means the client reused a key by accident.

**Cooling-off** — a window after adding a new payee during which large payments to them are refused.
The single most effective control against authorised-push-payment fraud.

**Confirmation of Payee** — checking the payee's name against the account before the debit. Returns
MATCH / CLOSE_MATCH / NO_MATCH.

---

## Cards

**PAN** — the 16-digit card number. **Never stored, never logged, never in a contract.** Cards are
identified by a token; the last four digits are the only fragment that leaves the vault.

**Authorisation → capture → clearing → settlement** — the four stages of card spend. Auth places a
hold; capture converts it; clearing and settlement move value with the network.

**MCC** — merchant category code. Drives spend categorisation and category-blocking controls.

**3DS** — the step-up challenge on an online purchase.

**Chargeback** — the customer disputes a card transaction and the value is pulled back from the
merchant. **Representment** is the merchant pushing back with evidence.

---

## Credit

**APR** — annual percentage rate, held in basis points. **Amortisation schedule** — the instalment
table; the final instalment absorbs rounding so the total reconciles exactly.

**DPD** — days past due. Drives arrears buckets (30/60/90) and provisioning.

**Payment allocation order** — fees, then interest, then principal. Changing this order changes how
much a customer pays over the life of a loan, so it is a product decision, not an implementation
detail.

**Early repayment rebate** — interest the customer does not pay because they settled early.

---

## Compliance

**KYC tier** — 0 to 3. Each tier unlocks higher limits and more products. A customer is never
blocked for being low-tier; they are told which tier the action needs and how to reach it.

**PEP** — politically exposed person. **Sanctions screening** — matching against restricted-party
lists, with fuzzy name matching and a score.

**Structuring** — breaking one large transaction into several below a reporting threshold. An AML
rule detects it.

**SAR** — suspicious activity report. Filed to a regulator; simulated here.

**Dual approval / maker-checker** — a manual posting needs two different admins. The initiator can
never be the approver.

---

## Simulation

**Simulated clock** — the time the application believes it is. Every service reads `ClockService`;
nothing calls `new Date()`. Advancing it by a month produces a real month of interest, statements,
standing orders and arrears.

**Scenario** — a preset burst of activity: payday, fraud wave, market crash, rail outage.

**Minting** — crediting the external clearing account so simulated inbound money has a source. Even
fake money must come from somewhere, or the trial balance stops summing to zero and the double-entry
guarantee is quietly worthless.
