import { ErrorCode, TransferOrderStatus } from '@reliance/contracts';
import { type Money, type MoneyJSON } from '@reliance/money';

import { AppError } from '../../common/errors/app-error.js';
import { fromWire } from '../../common/money/money.codec.js';

import { TRANSFER_ORDER_LABEL } from './transfer-order.constants.js';
import { type TransferOrderRecord } from './transfer-order.store.js';

/**
 * What a customer may and may not do to a standing order.
 *
 * Pure predicates over a record and a request, so the two services below stay about
 * sequencing and the database, and every refusal here can be read in one place next to
 * the reason for it.
 */

/** The statuses a customer can still act on. A cancelled or finished order is history. */
export const LIVE_STATUSES: readonly TransferOrderStatus[] = [
  TransferOrderStatus.ACTIVE,
  TransferOrderStatus.PAUSED,
  TransferOrderStatus.FAILING,
];

/**
 * The same answer whether the order is someone else's or does not exist.
 *
 * A 403 on the first case would confirm the id is real, which turns the endpoint into a
 * way of enumerating other customers' standing orders.
 */
export function orderNotFound(orderId: string): AppError {
  return AppError.notFound(TRANSFER_ORDER_LABEL, orderId);
}

/** A change to an order that has already been stopped or has finished paying. */
export function assertLive(order: TransferOrderRecord): void {
  if (LIVE_STATUSES.includes(order.status)) return;

  throw AppError.conflict(
    ErrorCode.CONFLICT,
    order.status === TransferOrderStatus.CANCELLED
      ? 'This standing order has been stopped. Set up a new one to start paying again.'
      : 'This standing order has made all the payments it was set up for.',
  );
}

/**
 * Statuses with a payment on the way, and therefore one that can be skipped.
 *
 * `FAILING` is in the list on purpose. An order the bank has not managed to pay is exactly
 * the one a customer reaches for the skip button on, and refusing them there would leave
 * stopping it altogether as the only way out of a month they wanted to miss anyway.
 */
export const RUNNING_STATUSES: readonly TransferOrderStatus[] = [
  TransferOrderStatus.ACTIVE,
  TransferOrderStatus.FAILING,
];

/** The payment a skip would drop, and the check that there is one. */
export function requireSkippableRun(order: TransferOrderRecord): Date {
  assertLive(order);

  if (RUNNING_STATUSES.includes(order.status) && order.nextRunAt !== null) return order.nextRunAt;

  throw AppError.conflict(
    ErrorCode.CONFLICT,
    order.status === TransferOrderStatus.PAUSED
      ? 'This standing order is paused, so no payment is due to skip. Resume it first.'
      : 'This standing order has no payment scheduled to skip.',
  );
}

/**
 * A standing order pays one currency out of one account.
 *
 * There is no rate here and no quote, so an amount in a currency the account does not
 * hold has no defined value on the day it would be paid. Refusing is the only answer that
 * does not invent an exchange rate on the customer's behalf.
 */
export function assertCurrencyMatches(amount: { currency: string }, currency: string): void {
  if (amount.currency === currency) return;

  throw new AppError({
    code: ErrorCode.CURRENCY_MISMATCH,
    message: `A standing order from this account has to be in ${currency}.`,
    context: { requested: amount.currency, account: currency },
  });
}

/**
 * The amount, as money rather than as a string.
 *
 * The contract's positive-money schema accepts `"0"` — it rejects a minus sign, not a
 * zero — so a standing order for nothing is a valid request that would sit on the
 * customer's list looking like a payment and post an empty entry every month.
 */
export function requirePayableAmount(amount: MoneyJSON): Money {
  const money = fromWire(amount);
  if (money.isPositive) return money;

  throw new AppError({
    code: ErrorCode.INVALID_AMOUNT,
    message: 'Enter how much to pay each time.',
    context: { amount: amount.amount },
  });
}

/** The start date, against the bank's own business date. */
export function assertStartNotPast(startsOn: string, today: string): void {
  if (startsOn >= today) return;

  throw AppError.validation('Choose a start date from today onwards.', [
    { path: 'startsOn', message: `must not be before ${today}` },
  ]);
}

/** The end date, against the start it has to follow. */
export function assertEndAfterStart(startsOn: string, endsOn: string | null): void {
  if (endsOn === null || endsOn >= startsOn) return;

  throw AppError.validation('The end date has to be on or after the start date.', [
    { path: 'endsOn', message: `must not be before ${startsOn}` },
  ]);
}

/**
 * A rule that describes no payment at all.
 *
 * Reachable from an honest request — "every year on the 29th of February, ending in
 * November" — and storing it would leave the customer with a standing order that looks
 * set up and never pays.
 */
export function assertSchedulePays(firstRun: string | null): asserts firstRun is string {
  if (firstRun !== null) return;

  throw AppError.validation('This schedule has no payment dates in it.', [
    { path: 'endsOn', message: 'no payment falls between the start and end dates' },
  ]);
}
