import { type CurrencyCode, type ExchangeRate } from '@reliance/money';

/** A mid-market level and where it sits against the previous close. */
export interface MidQuote {
  readonly rate: ExchangeRate;
  /** Movement against the previous close, in basis points. Negative means weaker. */
  readonly changeBps: number;
  readonly asOf: Date;
}

/**
 * Where the bank's mid-market rates come from.
 *
 * An abstract class so Nest resolves it as both a type and an injection token, and a port
 * so that the pricing, quoting and alerting services never learn whether the rate came
 * from a simulated tape, a vendor feed or a treasury desk. Swapping the source is a
 * one-line provider binding.
 *
 * The port deals only in **mid**. Spread is a commercial decision the bank makes about a
 * particular customer, and putting it behind the same interface as the market level would
 * make it possible to charge a customer a rate nobody could reconstruct.
 */
export abstract class RateProviderPort {
  /**
   * The mid-market level for a pair, or null when the bank cannot price it.
   *
   * Null rather than a throw: an unquotable pair is a normal answer to a normal question,
   * and the caller decides whether that means "hide the wallet" or "refuse the trade".
   */
  abstract midFor(from: CurrencyCode, to: CurrencyCode): Promise<MidQuote | null>;

  /** Every pair the bank quotes against `base`, for the rate board. */
  abstract board(base: CurrencyCode): Promise<readonly MidQuote[]>;
}
