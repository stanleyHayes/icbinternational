import { Injectable } from '@nestjs/common';

import { type Subscription } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { TransactionRangeReader } from '../transactions/transaction-range.reader.js';

import { DEFAULT_SUBSCRIPTION_LOOKBACK_DAYS, MILLISECONDS_PER_DAY } from './insights.constants.js';
import { toPeriod, type Period } from './period.js';
import { detectSubscription, groupByMerchant } from './subscription-detection.js';

/**
 * What the caller is asking about.
 *
 * The window has to be long enough to contain at least three charges at the cadence being
 * hunted, so a caller after annual subscriptions must ask for several years. Left unset
 * it defaults to a year, which finds every weekly, monthly and quarterly subscription and
 * no annual ones — an honest limit, and better than scanning a decade of history on every
 * page load to catch the rare case.
 */
export interface SubscriptionQuery {
  readonly userId: string;
  readonly accountId?: string;
  readonly from?: string;
  readonly to?: string;
}

/**
 * Finds the payments a customer has forgotten they set up.
 *
 * Detection is heuristic and the heuristics are deliberately conservative: a false
 * positive here tells someone they have a subscription they do not have, which sends them
 * looking for a cancellation page that does not exist. A missed one costs them nothing
 * they did not already have. The thresholds are documented on `detectSubscription`.
 *
 * Only card and direct-debit style debits with a counterparty are considered — a
 * subscription has someone to cancel it with, and a movement with no counterparty has
 * nobody.
 */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly range: TransactionRangeReader,
    private readonly clock: ClockService,
  ) {}

  /** Every recurring merchant charge detected in the window, most expensive first. */
  async detect(query: SubscriptionQuery): Promise<Subscription[]> {
    const period = this.windowFor(query);
    const records = await this.range.readAll({
      userId: query.userId,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      from: period.from,
      to: period.to,
    });

    const detected: Subscription[] = [];
    for (const charges of groupByMerchant(records).values()) {
      const subscription = detectSubscription(charges);
      if (subscription) detected.push(subscription);
    }

    // Most expensive first: the reason anyone opens this screen is to find the thing worth
    // cancelling, and that is almost always the largest one.
    return detected.sort(byAmountDescending);
  }

  /** The caller's window, or the last year on the simulated clock. */
  private windowFor(query: SubscriptionQuery): Period {
    const to = query.to ?? this.clock.now().toISOString();
    const lookbackMs = DEFAULT_SUBSCRIPTION_LOOKBACK_DAYS * MILLISECONDS_PER_DAY;
    const from = query.from ?? new Date(new Date(to).getTime() - lookbackMs).toISOString();

    return toPeriod(from, to);
  }
}

function byAmountDescending(left: Subscription, right: Subscription): number {
  const difference = BigInt(right.amount.amount) - BigInt(left.amount.amount);
  if (difference === 0n) return left.merchantName.localeCompare(right.merchantName);
  return difference > 0n ? 1 : -1;
}
