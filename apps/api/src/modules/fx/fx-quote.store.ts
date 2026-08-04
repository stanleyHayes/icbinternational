import { type ClientSession } from 'mongoose';

import { type CurrencyCode } from '@reliance/money';

import { type StoredMoney } from '../../common/money/money.codec.js';

/**
 * What a service is allowed to know about FX quote persistence.
 *
 * A quote is stored rather than signed and handed back, for the same reason a transfer
 * quote is: it may be executed exactly once, and "exactly once" is a state change. A
 * signed, stateless quote is replayable by construction — the holder presents it twice and
 * both presentations verify — which for a conversion means two debits against one price.
 *
 * The abstract class doubles as the Nest injection token, and the in-memory twin
 * reproduces the conditional consume faithfully so the exactly-once property is tested
 * against the same guarantee production relies on.
 */
export abstract class FxQuoteStore {
  /** Writes a quote and mints its public `qte_` id. */
  abstract insert(quote: NewFxQuote, session?: ClientSession): Promise<FxQuoteRecord>;

  /** The quote, scoped to the customer it was priced for. */
  abstract findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<FxQuoteRecord | null>;

  /**
   * Binds a quote to the conversion that executed it, and only if it is still unbound
   * and still inside its window.
   *
   * Returns null when it was already spent or had lapsed. Both conditions live in the
   * filter rather than in a service check above it, so two authorisations racing on one
   * quote are separated by the database: exactly one write matches, and the loser is told
   * to look for the conversion that already exists rather than debiting again.
   */
  abstract consume(input: ConsumeFxQuoteInput): Promise<FxQuoteRecord | null>;

  /** The conversion already booked against this quote, or null. The replay lookup. */
  abstract findByConversion(
    conversionId: string,
    session?: ClientSession,
  ): Promise<FxQuoteRecord | null>;

  /** A customer's conversions, newest first. Bounded by `limit`. */
  abstract listExecuted(userId: string, limit: number): Promise<readonly FxQuoteRecord[]>;
}

/** A persisted quote as services see it — a plain value, with no `.save()` on it. */
export interface FxQuoteRecord {
  readonly id: string;
  readonly userId: string;
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly sellAmount: StoredMoney;
  readonly buyAmount: StoredMoney;
  /** The all-in rate the customer was shown, as a decimal string. */
  readonly rate: string;
  readonly midRate: string;
  readonly spreadBps: number;
  /** The margin in the buy currency, so the cost is never hidden inside the rate. */
  readonly spreadCost: StoredMoney;
  readonly fee: StoredMoney;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  /** The conversion that spent this quote. Null while it is still executable. */
  readonly conversionId: string | null;
  readonly journalEntryId: string | null;
  readonly executedAt: Date | null;
}

/** A quote on its way in: no id yet and not yet spent. */
export type NewFxQuote = Omit<
  FxQuoteRecord,
  'id' | 'conversionId' | 'journalEntryId' | 'executedAt'
>;

export interface ConsumeFxQuoteInput {
  readonly quoteId: string;
  readonly userId: string;
  readonly conversionId: string;
  readonly journalEntryId: string;
  /** The instant the quote must still be live at. Compared inside the write. */
  readonly at: Date;
  readonly session?: ClientSession;
}
