import { type Money } from '@reliance/money';

import { type Posting } from '../../domain/ledger/index.js';

/**
 * Collapses an entry's postings into one balance movement per target and currency.
 *
 * An entry frequently touches the same place twice — a transfer with a fee debits the
 * customer for the amount and again for the fee, and a loan repayment credits
 * `LOANS_RECEIVABLE` for principal and `INTEREST_INCOME` for interest. Applying each leg
 * separately would work, but it doubles the writes inside the transaction and doubles the
 * surface for a write conflict against a hot account like `2000 Customer Deposits`.
 *
 * Grouping by currency as well as target is not optional: an FX entry moves GBP and USD
 * on the same account, and summing across them would throw at best and silently convert
 * at worst.
 */
export interface AggregatedEffect {
  /** GL code or customer account id, depending on which aggregator produced it. */
  readonly target: string;
  /** Signed net movement in a single currency. */
  readonly delta: Money;
}

/** Net movement per GL account, honouring each account's normal side. */
export function aggregateLedgerEffects(postings: readonly Posting[]): AggregatedEffect[] {
  return aggregate(
    postings,
    (posting) => posting.ledgerAccountCode,
    (posting) => posting.effectOnLedgerAccount,
  );
}

/**
 * Net movement per customer account.
 *
 * Legs with no `accountId` are pure general-ledger movements and are skipped — they have
 * already been counted by {@link aggregateLedgerEffects}.
 */
export function aggregateCustomerEffects(postings: readonly Posting[]): AggregatedEffect[] {
  return aggregate(
    postings,
    (posting) => posting.accountId,
    (posting) => posting.effectOnCustomerBalance,
  );
}

const KEY_SEPARATOR = '|';

function aggregate(
  postings: readonly Posting[],
  targetOf: (posting: Posting) => string | null,
  effectOf: (posting: Posting) => Money,
): AggregatedEffect[] {
  const totals = new Map<string, AggregatedEffect>();

  for (const posting of postings) {
    const target = targetOf(posting);
    if (target === null) continue;

    const effect = effectOf(posting);
    const bucket = `${target}${KEY_SEPARATOR}${effect.currency}`;
    const running = totals.get(bucket);

    totals.set(bucket, { target, delta: running ? running.delta.plus(effect) : effect });
  }

  // Zero-net movements are dropped: writing "add nothing" to a hot document buys a write
  // conflict for no change in state.
  return [...totals.values()].filter((effect) => !effect.delta.isZero);
}
