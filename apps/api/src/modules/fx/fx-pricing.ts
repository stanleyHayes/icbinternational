import { convert, invertRate, Money, type ExchangeRate } from '@reliance/money';

import { markDown } from './fx-spread.js';

/**
 * Turning a mid-market rate into the four numbers a customer is shown.
 *
 * A conversion can be fixed from either end — "sell me £500 of euros" or "I need €600" —
 * and the two must agree: pricing one direction and then re-pricing the other from the
 * result has to land back where it started, or the customer sees the figure move while
 * they are reading it. Both paths therefore derive from the same customer rate, and only
 * the rounding step differs.
 *
 * Nothing here is stateful and nothing here reads a clock. Given a mid and a spread, the
 * output is fully determined — which is what allows a stored quote to be re-derived and
 * audited months later.
 */

/** The complete price of one conversion. */
export interface FxPrice {
  readonly sellAmount: Money;
  readonly buyAmount: Money;
  /** The all-in rate the customer actually receives, spread included. */
  readonly customerRate: ExchangeRate;
  readonly midRate: ExchangeRate;
  readonly spreadBps: number;
  /** The margin, in the buy currency: what mid would have bought, less what they get. */
  readonly spreadCost: Money;
}

/** Price a conversion where the customer has fixed what they are spending. */
export function priceBySell(input: {
  sellAmount: Money;
  mid: ExchangeRate;
  spreadBps: number;
}): FxPrice {
  const customerRate = markDown(input.mid, input.spreadBps);
  const buyAmount = convert(input.sellAmount, customerRate);

  return assemble({ ...input, sellAmount: input.sellAmount, buyAmount, customerRate });
}

/**
 * Price a conversion where the customer has fixed what they will receive.
 *
 * The sell side is derived through the inverted customer rate and then verified: integer
 * rounding can leave the derived amount a minor unit short of buying what was asked for,
 * and a customer who asked for exactly €600 must not be handed €599.99. Where that
 * happens the sell amount is nudged up by the smallest step that covers it, so the promise
 * on the screen is the promise that is kept.
 */
export function priceByBuy(input: {
  buyAmount: Money;
  mid: ExchangeRate;
  spreadBps: number;
}): FxPrice {
  const customerRate = markDown(input.mid, input.spreadBps);
  const inverse = invertRate(customerRate);

  let sellAmount = convert(input.buyAmount, inverse);
  if (convert(sellAmount, customerRate).lessThan(input.buyAmount)) {
    sellAmount = sellAmount.plus(Money.fromMinor(1n, sellAmount.currency));
  }

  return assemble({ ...input, sellAmount, buyAmount: input.buyAmount, customerRate });
}

/**
 * The common tail of both paths: what the margin actually came to.
 *
 * `spreadCost` is what the mid would have bought less what the customer receives, in the
 * buy currency, because that is precisely the amount the ledger recognises as FX income.
 * It is floored at zero: on a sub-minor-unit conversion rounding can make the two equal,
 * and a bank booking a negative margin because of a rounding step would be recording an
 * expense it never incurred.
 */
function assemble(input: {
  sellAmount: Money;
  buyAmount: Money;
  customerRate: ExchangeRate;
  mid: ExchangeRate;
  spreadBps: number;
}): FxPrice {
  const atMid = convert(input.sellAmount, input.mid);
  const margin = atMid.minus(input.buyAmount);

  return {
    sellAmount: input.sellAmount,
    buyAmount: input.buyAmount,
    customerRate: input.customerRate,
    midRate: input.mid,
    spreadBps: input.spreadBps,
    spreadCost: margin.isNegative ? Money.zero(margin.currency) : margin,
  };
}
