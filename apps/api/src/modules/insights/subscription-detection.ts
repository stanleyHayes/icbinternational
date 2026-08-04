import { TransactionDirection, type Subscription } from '@reliance/contracts';

import { type TransactionRecord } from '../transactions/repositories/transaction.store.js';

import {
  CADENCE_DAYS,
  CADENCE_TOLERANCE_DAYS,
  MILLISECONDS_PER_DAY,
  MIN_SUBSCRIPTION_CHARGES,
  SUBSCRIPTION_AMOUNT_TOLERANCE_BPS,
  BASIS_POINTS_SCALE,
} from './insights.constants.js';

type Cadence = Subscription['cadence'];

/**
 * Groups a customer's debits by who they were paid to.
 *
 * Keyed on the merchant id when the rail supplied one and on the lower-cased name
 * otherwise. The id is preferred because merchants rename themselves — a customer whose
 * gym rebranded has one subscription, not two, and the acquirer's id is the only thing
 * that survives that.
 */
export function groupByMerchant(
  records: readonly TransactionRecord[],
): Map<string, TransactionRecord[]> {
  const groups = new Map<string, TransactionRecord[]>();

  for (const record of records) {
    if (record.direction !== TransactionDirection.DEBIT) continue;
    const key = merchantKeyOf(record);
    if (!key) continue;

    const existing = groups.get(key);
    if (existing) existing.push(record);
    else groups.set(key, [record]);
  }

  return groups;
}

function merchantKeyOf(record: TransactionRecord): string | null {
  const counterparty = record.counterparty;
  if (!counterparty) return null;
  return counterparty.merchantId ?? counterparty.name.trim().toLowerCase();
}

/**
 * Decides whether a series of charges to one merchant is a subscription.
 *
 * Three tests, all of which must pass:
 *
 * 1. **Enough charges.** Two is a coincidence; three establishes an interval and lets it
 *    be checked for consistency, which two cannot.
 * 2. **A stable amount.** Every charge within 5% of the median. That absorbs the honest
 *    variation in real recurring payments — a usage-based utility bill, VAT rounding, a
 *    foreign subscription moving with the exchange rate — without admitting a coffee shop
 *    the customer simply visits weekly at whatever a coffee costs that day.
 * 3. **A recognisable, *consistent* cadence.** The median gap must be within five days of
 *    weekly, monthly, quarterly or annual — and every individual gap must be within five
 *    days of that median. Checking only the median is not enough: with three charges
 *    there are two gaps, and the median of two is simply the smaller one, so a series
 *    spaced 33 and 58 days apart would be called monthly on the strength of the 33.
 *
 * Five days rather than something tighter because monthly billing is not 30 days: it
 * lands on the same date each month, 28 to 31 days apart, and a weekend or a bank holiday
 * moves a direct debit by another day or two.
 *
 * The median is used rather than the mean throughout, because a single mis-typed manual
 * payment or one skipped month would drag a mean far enough to reject a genuine series.
 *
 * @returns The detected subscription, or null when the series is just repeat custom.
 */
export function detectSubscription(charges: readonly TransactionRecord[]): Subscription | null {
  if (charges.length < MIN_SUBSCRIPTION_CHARGES) return null;

  const ordered = [...charges].sort(
    (left, right) => left.bookedAt.getTime() - right.bookedAt.getTime(),
  );

  const amounts = ordered.map((charge) => BigInt(charge.amount.amount));
  const typical = median(amounts);
  if (!isAmountStable(amounts, typical)) return null;

  const gapDays = gapsInDays(ordered);
  const typicalGap = medianNumber(gapDays);
  if (!isCadenceConsistent(gapDays, typicalGap)) return null;

  const cadence = cadenceFor(typicalGap);
  if (!cadence) return null;

  return describe({ ordered, typical, typicalGap, cadence });
}

/** Every interval close to the typical one — a subscription bills on a rhythm. */
function isCadenceConsistent(gapDays: readonly number[], typicalGap: number): boolean {
  return gapDays.every((gap) => Math.abs(gap - typicalGap) <= CADENCE_TOLERANCE_DAYS);
}

function describe(input: {
  ordered: readonly TransactionRecord[];
  typical: bigint;
  typicalGap: number;
  cadence: Cadence;
}): Subscription {
  const last = input.ordered.at(-1);
  if (!last) throw new RangeError('detectSubscription was given an empty series');

  return {
    merchantName: last.counterparty?.name ?? last.description,
    logoUrl: last.counterparty?.logoUrl ?? null,
    amount: { amount: input.typical.toString(), currency: last.amount.currency },
    cadence: input.cadence,
    lastChargedAt: last.bookedAt.toISOString(),
    // Projected from the observed gap rather than the nominal cadence, so a subscription
    // that actually bills every 28 days is not predicted two days late every month.
    nextExpectedAt: new Date(
      last.bookedAt.getTime() + input.typicalGap * MILLISECONDS_PER_DAY,
    ).toISOString(),
    transactionCount: input.ordered.length,
  } as Subscription;
}

function isAmountStable(amounts: readonly bigint[], typical: bigint): boolean {
  if (typical <= 0n) return false;

  const tolerance = BigInt(SUBSCRIPTION_AMOUNT_TOLERANCE_BPS);
  const scale = BigInt(BASIS_POINTS_SCALE);

  return amounts.every((amount) => {
    const deviation = amount > typical ? amount - typical : typical - amount;
    // Cross-multiplied rather than divided, so the comparison stays exact in integers.
    return deviation * scale <= tolerance * typical;
  });
}

function gapsInDays(ordered: readonly TransactionRecord[]): number[] {
  return ordered.slice(1).map((charge, index) => {
    const previous = ordered[index];
    if (!previous) return 0;
    return (charge.bookedAt.getTime() - previous.bookedAt.getTime()) / MILLISECONDS_PER_DAY;
  });
}

/** The nominal cadence the observed gap is closest to, if any is close enough. */
function cadenceFor(gapDays: number): Cadence | null {
  const candidates = Object.entries(CADENCE_DAYS) as [Cadence, number][];

  return (
    candidates.find(([, nominal]) => Math.abs(gapDays - nominal) <= CADENCE_TOLERANCE_DAYS)?.[0] ??
    null
  );
}

/**
 * Median of an integer series.
 *
 * The lower of the two middles on an even count, rather than their average, so the result
 * is always a value the customer was actually charged — a median of `£9.99` and `£10.99`
 * reported as `£10.49` is an amount that appears on no statement.
 */
function median(values: readonly bigint[]): bigint {
  const sorted = [...values].sort(ascending);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0n;
}

function ascending(left: bigint, right: bigint): number {
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function medianNumber(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}
