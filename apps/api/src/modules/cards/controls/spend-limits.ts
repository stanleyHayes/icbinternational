import { DeclineReason } from '@reliance/contracts';
import { Money, sumMoney, type CurrencyCode } from '@reliance/money';

import { fromStored } from '../../../common/money/money.codec.js';
import { type AuthorisationRecord } from '../authorisation/authorisation.store.js';
import { type StoredCardControls } from '../card.store.js';

/**
 * Ceilings, and how much of each one is already used.
 *
 * Spend is measured from the *authorisations* rather than from the ledger, and that is
 * the load-bearing decision in this file. A hold placed an hour ago has not moved any
 * money yet, but the customer has committed it; leaving it out of a daily limit would let
 * somebody spend their limit twice over at merchants that clear slowly, which is exactly
 * the pattern a compromised card produces.
 *
 * Pure, so every ceiling can be proven with a fixture instead of a database.
 */

/** What a limit check sees. */
export interface SpendWindows {
  /** Approved and captured authorisations since the start of the customer's day. */
  readonly today: readonly AuthorisationRecord[];
  /** The same, since the start of the customer's month. */
  readonly thisMonth: readonly AuthorisationRecord[];
  /** Cash withdrawals only, since the start of the day. */
  readonly atmToday: readonly AuthorisationRecord[];
}

/** One ceiling and what stands against it. */
export interface LimitUsage {
  readonly limit: Money;
  readonly used: Money;
  readonly remaining: Money;
}

/** Every ceiling on a card, with its usage. What the app draws its progress bars from. */
export interface CardLimitSnapshot {
  readonly perTransaction: Money | null;
  readonly daily: LimitUsage | null;
  readonly monthly: LimitUsage | null;
  readonly dailyAtm: LimitUsage | null;
}

/**
 * Whether this amount breaches any ceiling on the card.
 *
 * Returns the reason rather than a boolean so the caller can put a real code on the
 * decline. A null limit is not "zero" — it means the customer has not set one and only
 * the product's own matrix applies, which is checked elsewhere.
 */
export function limitDecline(input: {
  controls: StoredCardControls;
  amount: Money;
  windows: SpendWindows;
  isCashWithdrawal: boolean;
}): DeclineReason | null {
  const { controls, amount, windows } = input;

  if (exceeds(amount, controls.perTransactionLimit)) return DeclineReason.LIMIT_EXCEEDED;

  const currency = amount.currency;
  const daily = spentIn(windows.today, currency).plus(amount);
  if (exceeds(daily, controls.dailySpendLimit)) return DeclineReason.LIMIT_EXCEEDED;

  const monthly = spentIn(windows.thisMonth, currency).plus(amount);
  if (exceeds(monthly, controls.monthlySpendLimit)) return DeclineReason.LIMIT_EXCEEDED;

  if (input.isCashWithdrawal) {
    const atm = spentIn(windows.atmToday, currency).plus(amount);
    if (exceeds(atm, controls.dailyAtmLimit)) return DeclineReason.LIMIT_EXCEEDED;
  }

  return null;
}

/** Every ceiling and its usage, for the card's controls screen. */
export function limitSnapshot(input: {
  controls: StoredCardControls;
  windows: SpendWindows;
  currency: CurrencyCode;
}): CardLimitSnapshot {
  const { controls, windows, currency } = input;

  return {
    perTransaction: controls.perTransactionLimit ? fromStored(controls.perTransactionLimit) : null,
    daily: usageFor(controls.dailySpendLimit, windows.today, currency),
    monthly: usageFor(controls.monthlySpendLimit, windows.thisMonth, currency),
    dailyAtm: usageFor(controls.dailyAtmLimit, windows.atmToday, currency),
  };
}

/**
 * The largest amount this card could still authorise, or null when nothing caps it.
 *
 * Used to decide a partial approval: a merchant who accepts less than they asked for is
 * offered whatever the tightest ceiling still allows, which turns a hard decline at a
 * fuel pump into a smaller tank of fuel.
 */
export function headroom(input: {
  controls: StoredCardControls;
  windows: SpendWindows;
  currency: CurrencyCode;
  isCashWithdrawal: boolean;
}): Money | null {
  const snapshot = limitSnapshot(input);
  const candidates = [
    snapshot.perTransaction,
    snapshot.daily?.remaining ?? null,
    snapshot.monthly?.remaining ?? null,
    input.isCashWithdrawal ? (snapshot.dailyAtm?.remaining ?? null) : null,
  ].filter((candidate): candidate is Money => candidate !== null);

  const [first, ...rest] = candidates;
  if (!first) return null;

  return rest.reduce<Money>((lowest, next) => (next.lessThan(lowest) ? next : lowest), first);
}

/** Sum of the amounts in a window, in the card's currency. */
export function spentIn(records: readonly AuthorisationRecord[], currency: CurrencyCode): Money {
  return sumMoney(
    records.map((record) => fromStored(record.capturedAmount ?? record.amount)),
    currency,
  );
}

function usageFor(
  limit: { amount: string; currency: string } | null,
  window: readonly AuthorisationRecord[],
  currency: CurrencyCode,
): LimitUsage | null {
  if (!limit) return null;

  const ceiling = fromStored(limit);
  const used = spentIn(window, currency);
  const remaining = ceiling.minus(used);

  return {
    limit: ceiling,
    used,
    remaining: remaining.isNegative ? Money.zero(currency) : remaining,
  };
}

function exceeds(amount: Money, limit: { amount: string; currency: string } | null): boolean {
  return limit !== null && amount.greaterThan(fromStored(limit));
}
