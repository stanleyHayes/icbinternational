import {
  TransferRail,
  TransferStatus,
  type FxQuote,
  type FxRate,
  type Transfer,
} from '@reliance/contracts';
import { formatRate, type ExchangeRate } from '@reliance/money';

import { type StoredMoney } from '../../common/money/money.codec.js';
import { toIso } from '../accounts/index.js';

import { type FxQuoteRecord } from './fx-quote.store.js';
import { halfOf, markDown, markUp } from './fx-spread.js';
import { type MidQuote } from './rate-feed/rate-provider.port.js';

/** What the customer's timeline says about a conversion, in their words. */
const CONVERSION_TIMELINE = {
  submitted: 'Exchange authorised at the quoted rate',
  settled: 'Converted funds credited to your wallet',
} as const;

/**
 * Persisted and computed shapes, projected onto the wire.
 *
 * Two things are deliberately *not* projected. `userId`, because echoing the owner's id
 * back to the owner tells them nothing and gives a future bug somewhere to leak it. And
 * the internal walk state behind a rate, because the customer is entitled to the price and
 * to how it was built — mid, spread, cost in money — not to the machinery that produced it.
 */

/** A mid-market quote and the bank's spread, as the rate board shows it. */
export function toContractRate(quote: MidQuote, spreadBps: number): FxRate {
  const half = halfOf(spreadBps);

  return {
    from: quote.rate.from,
    to: quote.rate.to,
    mid: formatRate(quote.rate),
    bid: formatRate(markDown(quote.rate, half)),
    ask: formatRate(markUp(quote.rate, half)),
    spreadBps,
    changeBps: quote.changeBps,
    asOf: toIso(quote.asOf),
  };
}

/** A held price, as the customer sees it before they commit. */
export function toContractQuote(record: FxQuoteRecord): FxQuote {
  return {
    id: record.id,
    from: record.from,
    to: record.to,
    sellAmount: toWireMoney(record.sellAmount),
    buyAmount: toWireMoney(record.buyAmount),
    rate: record.rate,
    midRate: record.midRate,
    spreadBps: record.spreadBps,
    spreadCost: toWireMoney(record.spreadCost),
    fee: toWireMoney(record.fee),
    expiresAt: toIso(record.expiresAt),
    createdAt: toIso(record.createdAt),
  };
}

/**
 * An executed conversion, as a transfer.
 *
 * A conversion between two of the customer's own wallets *is* a transfer — money leaves
 * one account of theirs and arrives in another — so it is reported in the shape the client
 * already knows how to render, rather than as a fifth thing with its own timeline widget.
 * The rail is `INTERNAL` because nothing left the bank, and `exchangeRate` carries the
 * all-in rate they were quoted.
 */
export function toContractConversion(record: FxQuoteRecord): Transfer {
  const at = record.executedAt ?? record.createdAt;

  return {
    id: requireConversionId(record),
    rail: TransferRail.INTERNAL,
    status: TransferStatus.SETTLED,
    sourceAccountId: record.fromAccountId,
    destination: { kind: 'INTERNAL', accountId: record.toAccountId },
    debitAmount: toWireMoney(record.sellAmount),
    creditAmount: toWireMoney(record.buyAmount),
    fee: toWireMoney(record.fee),
    exchangeRate: record.rate,
    reference: null,
    railReference: null,
    returnCode: null,
    returnReason: null,
    journalEntryId: record.journalEntryId,
    timeline: [
      { status: TransferStatus.SUBMITTED, at: toIso(at), detail: CONVERSION_TIMELINE.submitted },
      { status: TransferStatus.SETTLED, at: toIso(at), detail: CONVERSION_TIMELINE.settled },
    ],
    estimatedArrival: toIso(at),
    createdAt: toIso(record.createdAt),
    settledAt: toIso(at),
  };
}

/** A decimal rate string, for storing what the customer was shown. */
export function rateToString(rate: ExchangeRate): string {
  return formatRate(rate);
}

/**
 * Stored money to wire money.
 *
 * The two shapes are identical by design — see `money.codec.ts` — so this widens the
 * currency's type rather than converting anything. Stated as a function anyway, so that if
 * they ever diverge there is one place that finds out.
 */
function toWireMoney(stored: StoredMoney): Transfer['debitAmount'] {
  return {
    amount: stored.amount,
    currency: stored.currency as Transfer['debitAmount']['currency'],
  };
}

/** A record without a conversion id has not been executed and is not a transfer yet. */
function requireConversionId(record: FxQuoteRecord): string {
  if (record.conversionId) return record.conversionId;
  throw new RangeError(`FX quote ${record.id} has not been executed`);
}
