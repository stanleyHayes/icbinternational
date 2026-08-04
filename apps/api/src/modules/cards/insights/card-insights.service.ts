import { Injectable } from '@nestjs/common';

import { AuthorisationStatus } from '@reliance/contracts';
import { Money, sumMoney, type CurrencyCode } from '@reliance/money';

import { fromStored } from '../../../common/money/money.codec.js';
import {
  AuthorisationStore,
  type AuthorisationRecord,
} from '../authorisation/authorisation.store.js';
import { CardService } from '../card.service.js';

import { labelFor } from './mcc-catalogue.js';
import { detectSubscriptions, type DetectedSubscription } from './subscription-detection.js';

/** How many authorisations an insights read looks back over. */
const INSIGHT_WINDOW_SIZE = 500;

/** Denominator for a share expressed in basis points. */
const BASIS_POINTS = 10_000n;

/** One row of the spending breakdown. */
export interface CategorySpend {
  readonly mcc: string;
  /** The customer-facing name, e.g. "Groceries". */
  readonly label: string;
  readonly total: Money;
  readonly transactionCount: number;
  /** This category's share of the card's spend, in basis points. */
  readonly shareBps: number;
}

/** Everything the card's insights panel draws. */
export interface CardInsights {
  readonly cardId: string;
  readonly currency: CurrencyCode;
  readonly totalSpend: Money;
  readonly byCategory: readonly CategorySpend[];
  readonly subscriptions: readonly DetectedSubscription[];
  /** How many payments the card's own controls refused, and why they were refused. */
  readonly declines: readonly DeclineTally[];
}

/** How often one decline reason came up. */
export interface DeclineTally {
  readonly reason: string;
  readonly count: number;
}

/**
 * What a card's spending actually looks like.
 *
 * Built from authorisations rather than from the transaction feed, and that is a
 * deliberate difference. The feed is per-account: it cannot tell one card's spend from
 * another's on a joint account with four cards on it, and it has no row at all for the
 * payments that were declined. Both of those are exactly what a customer looking at a
 * single card wants to see.
 */
@Injectable()
export class CardInsightsService {
  constructor(
    private readonly cards: CardService,
    private readonly authorisations: AuthorisationStore,
  ) {}

  /** Spend by category, detected subscriptions and refusals, for one card. */
  async forCard(userId: string, cardId: string): Promise<CardInsights> {
    const card = await this.cards.requireOwned(userId, cardId);
    const currency = card.currency as CurrencyCode;
    const history = await this.authorisations.listByCard(card.id, INSIGHT_WINDOW_SIZE);

    const spend = history.filter((record) => isSpend(record));
    const total = sumMoney(
      spend.map((record) => amountOf(record)),
      currency,
    );

    return {
      cardId: card.id,
      currency,
      totalSpend: total,
      byCategory: byCategory(spend, currency, total),
      subscriptions: detectSubscriptions(history, currency),
      declines: declineTally(history),
    };
  }

  /**
   * Subscriptions found on one card.
   *
   * Separate from the full insights read because the app shows the list on its own —
   * "what am I paying for every month?" is its own question, and answering it should not
   * require computing a category breakdown nobody is looking at.
   */
  async subscriptionsFor(userId: string, cardId: string): Promise<readonly DetectedSubscription[]> {
    const card = await this.cards.requireOwned(userId, cardId);
    const history = await this.authorisations.listByCard(card.id, INSIGHT_WINDOW_SIZE);

    return detectSubscriptions(history, card.currency as CurrencyCode);
  }
}

/**
 * Spend grouped by merchant category, largest first.
 *
 * Shares are basis points of the total rather than a percentage, because a percentage
 * would have to be a float and floats are banned anywhere near money. The caller divides
 * by a hundred to render.
 */
function byCategory(
  spend: readonly AuthorisationRecord[],
  currency: CurrencyCode,
  total: Money,
): CategorySpend[] {
  const buckets = new Map<string, AuthorisationRecord[]>();

  for (const record of spend) {
    const existing = buckets.get(record.mcc) ?? [];
    existing.push(record);
    buckets.set(record.mcc, existing);
  }

  return [...buckets.entries()]
    .map(([mcc, records]) => toCategorySpend(mcc, records, currency, total))
    .sort((left, right) => (right.total.greaterThan(left.total) ? 1 : -1));
}

function toCategorySpend(
  mcc: string,
  records: readonly AuthorisationRecord[],
  currency: CurrencyCode,
  total: Money,
): CategorySpend {
  const subtotal = sumMoney(
    records.map((record) => amountOf(record)),
    currency,
  );

  return {
    mcc,
    label: labelFor(mcc),
    total: subtotal,
    transactionCount: records.length,
    shareBps: total.isZero ? 0 : Number((subtotal.amount * BASIS_POINTS) / total.amount),
  };
}

function declineTally(history: readonly AuthorisationRecord[]): DeclineTally[] {
  const counts = new Map<string, number>();

  for (const record of history) {
    if (!record.declineReason) continue;
    counts.set(record.declineReason, (counts.get(record.declineReason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
}

/** Whether an authorisation represents money the customer actually committed. */
function isSpend(record: AuthorisationRecord): boolean {
  return (
    record.status === AuthorisationStatus.CAPTURED || record.status === AuthorisationStatus.APPROVED
  );
}

function amountOf(record: AuthorisationRecord): Money {
  return fromStored(record.capturedAmount ?? record.amount);
}
