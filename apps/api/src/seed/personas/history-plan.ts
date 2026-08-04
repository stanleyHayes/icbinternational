import { Money, type CurrencyCode } from '@reliance/money';

import { MERCHANTS, SUBSCRIPTIONS, type Merchant } from './merchant-directory.js';
import { type Persona } from './persona-definitions.js';
import { type SeededRandom } from './seeded-random.js';

/**
 * Turns a persona into a dated list of movements, before any of it touches the database.
 *
 * Planning and posting are separate on purpose. The plan is a pure function of the
 * persona and the seed, so it can be asserted on in a unit test without a Mongo replica
 * set — and when a generated history looks wrong, the question "did we plan it wrong or
 * post it wrong?" has an answer.
 */

export type MovementKind = 'SALARY' | 'PURCHASE' | 'SUBSCRIPTION' | 'TRANSFER_TO_SAVINGS';

export interface PlannedMovement {
  readonly kind: MovementKind;
  readonly at: Date;
  readonly amount: Money;
  readonly description: string;
  readonly merchantName?: string;
  readonly mcc?: string;
  readonly country?: string;
}

const MONTHS_PER_YEAR = 12;
const WEEKEND_UPLIFT_BPS = 3_500;
const SAVINGS_SWEEP_BPS = 1_200;
const SATURDAY = 6;
const SUNDAY = 0;
const IRREGULAR_INCOME_MIN = 90_000;
const IRREGULAR_INCOME_MAX = 480_000;
const IRREGULAR_INVOICES_PER_MONTH = 2;

/**
 * Builds the whole history for one persona, oldest first.
 *
 * Ordering matters downstream: the posting loop advances the simulated clock to each
 * movement in turn, and a clock cannot run backwards.
 */
export function planHistory(input: {
  persona: Persona;
  currency: CurrencyCode;
  endingAt: Date;
  random: SeededRandom;
  openingBalance: Money;
  floor: Money;
  /** Post-payday transfer to the persona's savings account, or null when it has none. */
  sweep: Money | null;
}): PlannedMovement[] {
  const { persona, currency, endingAt, random, openingBalance, floor, sweep } = input;
  const movements: PlannedMovement[] = [];

  for (let monthsAgo = persona.historyMonths; monthsAgo >= 1; monthsAgo -= 1) {
    const month = monthStarting(endingAt, monthsAgo);
    movements.push(...planMonth({ persona, currency, month, random, sweep }));
  }

  movements.sort((left, right) => left.at.getTime() - right.at.getTime());
  return withinMeans({ movements, openingBalance, floor });
}

/**
 * Drops the debits the persona could not actually have made.
 *
 * The month planners are independent of each other and of any balance — that is what
 * makes them testable — so nothing stopped them from planning 42 purchases against a
 * student's £214. Posting such a plan fails on the first debit past the overdraft floor,
 * which is the ledger correctly refusing to mint money.
 *
 * Dropping the movement is also what a bank does. A card payment with no funds behind it
 * is declined at authorisation and never reaches the ledger; it is not a smaller payment
 * and it is not a negative balance. Salary is never dropped: money arriving does not
 * depend on the balance it arrives into.
 *
 * The floor is the overdraft limit rather than zero, so a persona with an arranged
 * facility still spends into it — which is the state the overdraft screens need to show.
 */
function withinMeans(input: {
  movements: readonly PlannedMovement[];
  openingBalance: Money;
  floor: Money;
}): PlannedMovement[] {
  const { movements, openingBalance, floor } = input;
  const affordable: PlannedMovement[] = [];
  let balance = openingBalance;

  for (const movement of movements) {
    if (movement.kind === 'SALARY') {
      balance = balance.plus(movement.amount);
      affordable.push(movement);
      continue;
    }

    const after = balance.minus(movement.amount);
    if (after.lessThan(floor)) continue;

    balance = after;
    affordable.push(movement);
  }

  return affordable;
}

function planMonth(input: {
  persona: Persona;
  currency: CurrencyCode;
  month: Date;
  random: SeededRandom;
  sweep: Money | null;
}): PlannedMovement[] {
  const { persona, currency, month, random, sweep } = input;
  const income = planIncome({ persona, currency, month, random });

  return [
    // Income, then the sweep it funds, then the month's spending. The sort that follows is
    // stable and the sweep shares its salary's timestamp, so this order survives it.
    ...income,
    ...planSweeps(income, sweep),
    ...planSubscriptions({ persona, currency, month }),
    ...planPurchases({ persona, currency, month, random }),
  ];
}

/**
 * The standing transfer to savings that follows payday.
 *
 * Planned rather than applied by the posting loop, so the plan is a complete account of
 * what happens to the balance. While the loop added it as a side effect of seeing a
 * salary, the solvency walk could not see it and ran optimistic by a sweep a month.
 */
function planSweeps(income: readonly PlannedMovement[], sweep: Money | null): PlannedMovement[] {
  if (!sweep) return [];

  return income
    .filter((movement) => movement.kind === 'SALARY')
    .map((salary) => ({
      kind: 'TRANSFER_TO_SAVINGS' as const,
      at: salary.at,
      amount: sweep,
      description: 'Transfer to savings',
    }));
}

/** Salary on a fixed day, or several irregular invoices for a persona with no salary. */
function planIncome(input: {
  persona: Persona;
  currency: CurrencyCode;
  month: Date;
  random: SeededRandom;
}): PlannedMovement[] {
  const { persona, currency, month, random } = input;

  if (persona.monthlySalaryMinor > 0) {
    return [
      {
        kind: 'SALARY',
        at: dayIn(month, persona.salaryDay),
        amount: Money.fromMinor(persona.monthlySalaryMinor, currency),
        description: 'Salary',
      },
    ];
  }

  if (persona.purchasesPerMonth === 0) return [];

  return Array.from({ length: IRREGULAR_INVOICES_PER_MONTH }, () => ({
    kind: 'SALARY' as const,
    at: dayIn(month, random.intBetween(2, 26)),
    amount: Money.fromMinor(
      random.intBetween(IRREGULAR_INCOME_MIN, IRREGULAR_INCOME_MAX),
      currency,
    ),
    description: 'Invoice payment received',
  }));
}

function planSubscriptions(input: {
  persona: Persona;
  currency: CurrencyCode;
  month: Date;
}): PlannedMovement[] {
  const { persona, currency, month } = input;
  const wanted = new Set<string>(persona.subscriptions);

  return SUBSCRIPTIONS.filter((subscription) => wanted.has(subscription.name)).map(
    (subscription) => ({
      kind: 'SUBSCRIPTION' as const,
      at: dayIn(month, subscription.dayOfMonth),
      amount: Money.fromMinor(subscription.fixedMinor, currency),
      description: subscription.name,
      merchantName: subscription.name,
      mcc: subscription.mcc,
      country: subscription.country,
    }),
  );
}

/**
 * Discretionary card spend, biased toward weekends.
 *
 * Without the bias every day looks the same and a week-over-week chart is a flat line,
 * which is not what anyone's spending looks like.
 */
function planPurchases(input: {
  persona: Persona;
  currency: CurrencyCode;
  month: Date;
  random: SeededRandom;
}): PlannedMovement[] {
  const { persona, currency, month, random } = input;
  const daysInMonth = lastDayOf(month);
  const purchases: PlannedMovement[] = [];

  for (let index = 0; index < persona.purchasesPerMonth; index += 1) {
    const day = random.intBetween(1, daysInMonth);
    const at = dayIn(month, day);
    const weekend = at.getUTCDay() === SATURDAY || at.getUTCDay() === SUNDAY;

    if (!weekend && random.chanceBps(WEEKEND_UPLIFT_BPS)) continue;

    const merchant = random.pickWeighted(MERCHANTS);
    purchases.push({
      kind: 'PURCHASE',
      at,
      amount: Money.fromMinor(amountFor(merchant, random), currency),
      description: merchant.name,
      merchantName: merchant.name,
      mcc: merchant.mcc,
      country: merchant.country,
    });
  }

  return purchases;
}

/** How much a persona sweeps into savings after payday, as a share of salary. */
export function savingsSweepFor(persona: Persona, currency: CurrencyCode): Money | null {
  if (persona.monthlySalaryMinor === 0) return null;
  const BPS = 10_000;
  return Money.fromMinor(
    Math.round((persona.monthlySalaryMinor * SAVINGS_SWEEP_BPS) / BPS),
    currency,
  );
}

function amountFor(merchant: Merchant, random: SeededRandom): number {
  return random.intBetween(merchant.minMinor, merchant.maxMinor);
}

function monthStarting(reference: Date, monthsAgo: number): Date {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth() - monthsAgo;
  return new Date(Date.UTC(year, month, 1));
}

/** Clamps to the month's length, so a 31st subscription still charges in February. */
function dayIn(month: Date, day: number): Date {
  const clamped = Math.min(day, lastDayOf(month));
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), clamped, 10, 30));
}

function lastDayOf(month: Date): number {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Total months of history across every persona — used for the summary line. */
export function totalHistoryMonths(personas: readonly Persona[]): number {
  return personas.reduce((total, persona) => total + persona.historyMonths, 0) / MONTHS_PER_YEAR;
}
