import { type ClientSession } from 'mongoose';

import {
  type ChargeBearer,
  type FeeKind,
  type TransferDestination,
  type TransferRail,
} from '@reliance/contracts';

import { type StoredMoney } from '../../common/money/money.codec.js';

/**
 * What a service is allowed to know about quote persistence.
 *
 * A quote has to be *stored* rather than signed and handed back, and the reason is the
 * property the whole flow rests on: a quote may be executed exactly once. A stateless
 * signed quote is replayable by definition — the holder can present it as many times as
 * they like and every presentation verifies. Consumption is a state change, and a state
 * change needs somewhere to live.
 */
export abstract class QuoteStore {
  /** Writes a quote and mints its public `qte_` id. */
  abstract insert(quote: NewQuote, session?: ClientSession): Promise<QuoteRecord>;

  /** The quote, scoped to the customer who was quoted. */
  abstract findById(
    id: string,
    userId: string,
    session?: ClientSession,
  ): Promise<QuoteRecord | null>;

  /**
   * Binds a quote to the transfer that executed it, and only if it is still unbound.
   *
   * Returns null when it was already consumed. That conditional write is the exactly-once
   * guarantee at this layer: two executions of one quote both read it unbound, both try to
   * claim it, and precisely one succeeds — the loser reads the winner's transfer and
   * returns that instead of debiting the customer again.
   */
  abstract consume(input: ConsumeQuoteInput): Promise<QuoteRecord | null>;
}

/** A persisted quote as services see it — a plain value, with no `.save()` on it. */
export interface QuoteRecord {
  readonly id: string;
  readonly userId: string;
  readonly rail: TransferRail;
  readonly sourceAccountId: string;
  readonly destination: TransferDestination;
  /** The account the destination resolved to at pricing time, for an internal transfer. */
  readonly destinationAccountId: string | null;
  readonly debitAmount: StoredMoney;
  readonly creditAmount: StoredMoney;
  readonly fee: StoredMoney;
  /**
   * The schedule entry the fee was priced against, or null when nothing priced it.
   *
   * Stored rather than re-derived at execution for the same reason the amounts are: the
   * charge must consume the allowance the customer was quoted against, not whichever one
   * the catalogue would pick today.
   */
  readonly feeKind: FeeKind | null;
  readonly exchangeRate: string | null;
  readonly rateExpiresAt: Date | null;
  readonly chargeBearer: ChargeBearer;
  readonly requiresStepUp: boolean;
  readonly warnings: readonly string[];
  readonly estimatedArrival: Date;
  readonly cutOffAt: Date | null;
  readonly expiresAt: Date;
  /** The transfer that spent this quote. Null while it is still executable. */
  readonly consumedByTransferId: string | null;
  readonly createdAt: Date;
}

/** A quote on its way in: no id yet and not yet spent. */
export type NewQuote = Omit<QuoteRecord, 'id' | 'consumedByTransferId'>;

export interface ConsumeQuoteInput {
  readonly quoteId: string;
  readonly transferId: string;
  readonly session?: ClientSession;
}
