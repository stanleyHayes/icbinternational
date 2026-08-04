import { Injectable } from '@nestjs/common';

import { rateFromDecimalString, type CurrencyCode, type ExchangeRate } from '@reliance/money';

/**
 * Where a cross-currency figure gets its rate.
 *
 * Net worth is the only thing in this lane that has to compare two currencies, and it
 * must not invent a rate to do it. The port lets the FX workstream supply the real
 * mid-market rate later without the accounts module ever importing it — the same
 * inversion the ledger uses for `AccountBalancePort`, for the same reason.
 *
 * Nest resolves the abstract class as its own injection token, so rebinding it is a
 * one-line provider override in whichever module owns rates.
 */
export abstract class ExchangeRatePort {
  /**
   * The rate to convert `from` into `to`, or null when none is available.
   *
   * Null rather than a throw, so the caller decides what an unpriceable currency means.
   * For net worth it means refusing to answer, because a total that silently omits a
   * wallet is worse than an error that says which one it could not price.
   */
  abstract rateFor(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate | null>;
}

/** A rate of exactly one, as a decimal string, for the identity conversion. */
const UNITY = '1';

/**
 * The default binding: converts a currency to itself, and refuses everything else.
 *
 * This is the honest placeholder. A single-currency customer — which is nearly all of
 * them — gets a correct net worth today. A multi-currency customer gets
 * `RATE_UNAVAILABLE` naming the pair, which is true, until the FX module binds a real
 * rate source over this one. What it will never do is make a number up.
 */
@Injectable()
export class IdentityExchangeRatePort extends ExchangeRatePort {
  override async rateFor(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate | null> {
    return from === to ? rateFromDecimalString(from, to, UNITY) : null;
  }
}
