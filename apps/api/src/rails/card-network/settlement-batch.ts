/**
 * Closing a settlement batch.
 *
 * Pure arithmetic, deliberately. What a batch *is* — gross presented, interchange earned,
 * net moved — is a statement about money that has to be provable on paper, so it is
 * written as a function of its items rather than as a method on something that also talks
 * to a database.
 */

import { Money, sumMoney, type CurrencyCode } from '@reliance/money';

import {
  BASIS_POINTS_TOTAL,
  INTERCHANGE_BPS,
  SETTLEMENT_BATCH_PREFIX,
} from './card-network.constants.js';
import { type SettlementBatch, type SettlementItem } from './network-message.js';

/** Separator between the parts of a batch identifier. */
const BATCH_ID_SEPARATOR = '-';

/** How a settlement date is rendered inside a batch identifier: `YYYYMMDD`. */
const ISO_DATE_LENGTH = 10;

/** Digits the sequence number is padded to, so batch ids sort lexicographically. */
const SEQUENCE_DIGITS = 4;

/**
 * Builds the batch identifier the scheme and the bank both file the batch under.
 *
 * Date plus sequence, because a reconciliation clerk reading a batch id needs to know
 * which day's traffic it covers without opening it, and two batches on one day have to be
 * distinguishable when the first is re-cut after a rejection.
 */
export function settlementBatchId(cutOffAt: Date, sequence: number): string {
  const day = cutOffAt.toISOString().slice(0, ISO_DATE_LENGTH).replaceAll('-', '');
  const ordinal = String(sequence).padStart(SEQUENCE_DIGITS, '0');
  return [SETTLEMENT_BATCH_PREFIX, day, ordinal].join(BATCH_ID_SEPARATOR);
}

/**
 * Totals a batch.
 *
 * Interchange is truncated rather than rounded up. The issuer is claiming a fee from the
 * acquirer, and claiming a fraction of a penny more than the rate allows is the kind of
 * thing a scheme audit reverses across every batch in the period.
 *
 * @throws {RangeError} When the batch has no items. An empty batch is not a batch worth
 *   filing, and returning zeroes would let one be settled against silently.
 */
export function closeSettlementBatch(input: {
  id: string;
  items: readonly SettlementItem[];
  currency: CurrencyCode;
  cutOffAt: Date;
}): SettlementBatch {
  if (input.items.length === 0) {
    throw new RangeError(`Settlement batch ${input.id} has no cleared items to settle`);
  }

  const gross = sumMoney(
    input.items.map((item) => item.amount),
    input.currency,
  );
  const interchange = interchangeOn(gross);

  return {
    id: input.id,
    items: [...input.items],
    gross,
    interchange,
    net: gross.minus(interchange),
    cutOffAt: input.cutOffAt,
  };
}

/**
 * Interchange earned on an amount, truncated to the minor unit.
 *
 * Written in `bigint` and never in floating point: a rate applied to a batch of tens of
 * thousands of items is exactly where a half-penny of float error becomes a real
 * reconciliation break.
 */
export function interchangeOn(gross: Money): Money {
  const minor = (gross.amount * BigInt(INTERCHANGE_BPS)) / BigInt(BASIS_POINTS_TOTAL);
  return Money.fromMinor(minor, gross.currency);
}
