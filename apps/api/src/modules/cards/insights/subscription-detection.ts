import { AuthorisationStatus } from '@reliance/contracts';
import { type Money, sumMoney, type CurrencyCode } from '@reliance/money';

import { fromStored } from '../../../common/money/money.codec.js';
import { type AuthorisationRecord } from '../authorisation/authorisation.store.js';

import { isCommonlyRecurring } from './mcc-catalogue.js';

/** Milliseconds in a day, for measuring the gap between charges. */
const MILLISECONDS_PER_DAY = 86_400_000;

/** Fewest charges from one merchant before a pattern is worth calling a subscription. */
const MINIMUM_OCCURRENCES = 3;

/** Cadences a recurring charge can fall into, in days, with the slack each allows. */
const CADENCES = Object.freeze([
  Object.freeze({ name: 'WEEKLY' as const, days: 7, tolerance: 2 }),
  Object.freeze({ name: 'MONTHLY' as const, days: 30, tolerance: 5 }),
  Object.freeze({ name: 'QUARTERLY' as const, days: 91, tolerance: 10 }),
  Object.freeze({ name: 'ANNUAL' as const, days: 365, tolerance: 20 }),
]);

/** How far the amounts may vary and still count as the same subscription, in basis points. */
const AMOUNT_TOLERANCE_BPS = 1000n;

/** Denominator for the amount tolerance. */
const BASIS_POINTS = 10_000n;

/** How often a subscription bills. */
export type SubscriptionCadence = (typeof CADENCES)[number]['name'];

/** A recurring charge the bank believes it has spotted. */
export interface DetectedSubscription {
  readonly merchantId: string;
  readonly merchantName: string;
  readonly mcc: string;
  readonly cadence: SubscriptionCadence;
  /** The most recent amount charged. What the customer will pay next. */
  readonly amount: Money;
  readonly occurrences: number;
  readonly firstChargedAt: Date;
  readonly lastChargedAt: Date;
  /** When the next charge is expected, from the cadence and the last one. */
  readonly nextExpectedAt: Date;
  /** Total taken by this merchant across the window examined. */
  readonly totalPaid: Money;
}

/**
 * Finding the charges a customer forgot they agreed to.
 *
 * Three signals have to line up: the **same merchant**, a **steady interval**, and a
 * **stable amount**. Any one alone produces nonsense — a weekly grocery shop is regular
 * but not a subscription, and a single annual insurance premium is a subscription with
 * nothing yet to compare it against.
 *
 * The bar is deliberately three occurrences. Two charges a month apart is a coincidence
 * often enough that flagging it would train customers to ignore the feature, and the
 * whole value of subscription detection is that the list is short enough to read.
 *
 * Pure, and takes the authorisations rather than fetching them, so the heuristic can be
 * tuned against fixtures instead of a seeded database.
 */
export function detectSubscriptions(
  authorisations: readonly AuthorisationRecord[],
  currency: CurrencyCode,
): DetectedSubscription[] {
  const byMerchant = groupByMerchant(authorisations);

  return [...byMerchant.values()]
    .map((charges) => describeIfRecurring(charges, currency))
    .filter((found): found is DetectedSubscription => found !== null)
    .sort((left, right) => right.lastChargedAt.getTime() - left.lastChargedAt.getTime());
}

/** Whether these charges from one merchant look like a subscription, and how. */
function describeIfRecurring(
  charges: readonly AuthorisationRecord[],
  currency: CurrencyCode,
): DetectedSubscription | null {
  if (charges.length < MINIMUM_OCCURRENCES) return null;

  const ordered = [...charges].sort(
    (left, right) => left.authorisedAt.getTime() - right.authorisedAt.getTime(),
  );

  const cadence = cadenceOf(ordered);
  if (!cadence) return null;

  const amounts = ordered.map((charge) => amountOf(charge));
  if (!amountsAreStable(amounts)) return null;

  return buildSubscription({ ordered, amounts, cadence, currency });
}

function buildSubscription(input: {
  ordered: readonly AuthorisationRecord[];
  amounts: readonly Money[];
  cadence: (typeof CADENCES)[number];
  currency: CurrencyCode;
}): DetectedSubscription {
  const first = input.ordered[0];
  const last = input.ordered.at(-1);
  const latest = input.amounts.at(-1);
  if (!first || !last || !latest) throw new RangeError('Subscription built from no charges');

  return {
    merchantId: last.merchantId,
    merchantName: last.merchantName,
    mcc: last.mcc,
    cadence: input.cadence.name,
    amount: latest,
    occurrences: input.ordered.length,
    firstChargedAt: first.authorisedAt,
    lastChargedAt: last.authorisedAt,
    nextExpectedAt: new Date(
      last.authorisedAt.getTime() + input.cadence.days * MILLISECONDS_PER_DAY,
    ),
    totalPaid: sumMoney([...input.amounts], input.currency),
  };
}

/**
 * The cadence these charges fit, or null.
 *
 * Every gap has to fit the same cadence. A merchant billing monthly for a year and then
 * weekly has changed what they are doing, and averaging the two would produce a "next
 * expected" date the customer could not act on.
 */
function cadenceOf(ordered: readonly AuthorisationRecord[]): (typeof CADENCES)[number] | null {
  const gaps = ordered.slice(1).map((charge, index) => {
    const previous = ordered[index];
    if (!previous) return 0;
    return Math.round(
      (charge.authorisedAt.getTime() - previous.authorisedAt.getTime()) / MILLISECONDS_PER_DAY,
    );
  });

  return (
    CADENCES.find((cadence) =>
      gaps.every((gap) => Math.abs(gap - cadence.days) <= cadence.tolerance),
    ) ?? null
  );
}

/**
 * Whether the amounts are close enough to be the same subscription.
 *
 * Ten per cent of slack, because streaming services raise prices, gyms add a month of
 * peak pricing, and an insurer renews a pound dearer. A tighter rule would drop a
 * subscription at the exact moment the customer most wants to be told about it.
 */
function amountsAreStable(amounts: readonly Money[]): boolean {
  const first = amounts[0];
  if (!first) return false;

  const tolerance = (first.amount * AMOUNT_TOLERANCE_BPS) / BASIS_POINTS;

  return amounts.every((amount) => {
    const difference = amount.minus(first).abs();
    return difference.amount <= tolerance;
  });
}

/** Charges grouped by merchant, keeping only settled or pending spend. */
function groupByMerchant(
  authorisations: readonly AuthorisationRecord[],
): Map<string, AuthorisationRecord[]> {
  const grouped = new Map<string, AuthorisationRecord[]>();

  for (const record of authorisations) {
    if (!counts(record)) continue;
    const existing = grouped.get(record.merchantId) ?? [];
    existing.push(record);
    grouped.set(record.merchantId, existing);
  }

  return grouped;
}

/**
 * Whether a charge is evidence of a subscription.
 *
 * Declines are excluded: a card that failed three months running is a subscription the
 * customer has already stopped paying, and listing it as live would be actively
 * misleading. Recurring-flagged channels and habitually recurring categories both count.
 */
function counts(record: AuthorisationRecord): boolean {
  const settled =
    record.status === AuthorisationStatus.CAPTURED ||
    record.status === AuthorisationStatus.APPROVED;

  return (
    settled &&
    (record.channel === 'RECURRING' ||
      record.channel === 'ONLINE' ||
      isCommonlyRecurring(record.mcc))
  );
}

function amountOf(record: AuthorisationRecord): Money {
  return fromStored(record.capturedAmount ?? record.amount);
}
