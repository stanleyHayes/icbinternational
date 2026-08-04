import { Injectable } from '@nestjs/common';

import { AccountStatus, ErrorCode, type NetWorth } from '@reliance/contracts';
import { convert, Money, type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { fromStored, toWire } from '../../common/money/money.codec.js';
import { UsersService } from '../auth/users/index.js';

import { toIso } from './account.mapper.js';
import { AccountStore, type AccountRecord } from './account.store.js';
import { ExchangeRatePort } from './exchange-rate.port.js';

/**
 * What the customer is worth across every account and currency.
 *
 * Two decisions shape this:
 *
 * **Booked, not spendable.** Net worth uses `ledgerBalance`, ignoring holds and overdraft
 * facilities. A hold is money you still own that you cannot spend this second, and an
 * unused overdraft is somebody else's money — counting either would make the figure
 * answer a different question from the one the customer asked.
 *
 * **Overdrawn accounts are liabilities.** A negative balance is a debt, so it is reported
 * in `totalLiabilities` as a positive amount and subtracted from `net`, rather than being
 * netted invisibly into the asset total.
 *
 * The per-currency breakdown is always exact, because it involves no conversion. Only the
 * three aggregate figures depend on a rate, and if one is unavailable the whole answer is
 * refused — a total that quietly omits a wallet is a wrong number wearing a right one's
 * clothes.
 */
@Injectable()
export class NetWorthService {
  constructor(
    private readonly accounts: AccountStore,
    private readonly rates: ExchangeRatePort,
    private readonly users: UsersService,
    private readonly clock: ClockService,
  ) {}

  /**
   * The customer's aggregate position, in their own base currency.
   *
   * @throws {AppError} `RATE_UNAVAILABLE` when a held currency cannot be converted.
   */
  async forUser(userId: string): Promise<NetWorth> {
    const user = await this.users.requireById(userId);
    const baseCurrency = user.baseCurrency as CurrencyCode;

    const records = await this.accounts.listByUser({ userId });
    const balances = records.filter(isOpen).map((record) => fromStored(record.ledgerBalance));

    return this.aggregate(balances, baseCurrency);
  }

  /**
   * Classifies **per account**, not per currency.
   *
   * A customer with £1,200 in one account and £200 overdrawn in another has assets of
   * £1,200 and liabilities of £200 — netting the two into a single £1,000 asset before
   * classifying would hide the borrowing entirely, which is the number a lender and the
   * customer both most want to see.
   */
  private async aggregate(
    balances: readonly Money[],
    baseCurrency: CurrencyCode,
  ): Promise<NetWorth> {
    let assets = Money.zero(baseCurrency);
    let liabilities = Money.zero(baseCurrency);

    for (const balance of balances) {
      const converted = await this.toBase(balance, baseCurrency);
      if (converted.isNegative) {
        liabilities = liabilities.plus(converted.abs());
      } else {
        assets = assets.plus(converted);
      }
    }

    return {
      baseCurrency,
      totalAssets: toWire(assets),
      totalLiabilities: toWire(liabilities),
      net: toWire(assets.minus(liabilities)),
      byCurrency: [...totalPerCurrency(balances)].map(([currency, total]) => ({
        currency,
        total: toWire(total),
      })),
      asOf: toIso(this.clock.now()),
    };
  }

  private async toBase(amount: Money, baseCurrency: CurrencyCode): Promise<Money> {
    if (amount.currency === baseCurrency) return amount;

    const rate = await this.rates.rateFor(amount.currency, baseCurrency);
    if (!rate) {
      throw new AppError({
        code: ErrorCode.RATE_UNAVAILABLE,
        message: `No ${amount.currency}/${baseCurrency} rate is available, so your total cannot be shown right now.`,
        context: { from: amount.currency, to: baseCurrency },
      });
    }

    return convert(amount, rate);
  }
}

/** A closed account holds nothing and belongs to no total. */
function isOpen(account: AccountRecord): boolean {
  return account.status !== AccountStatus.CLOSED;
}

/** Sums booked balances by currency, preserving the order the accounts came back in. */
function totalPerCurrency(balances: readonly Money[]): Map<CurrencyCode, Money> {
  const totals = new Map<CurrencyCode, Money>();

  for (const balance of balances) {
    const running = totals.get(balance.currency) ?? Money.zero(balance.currency);
    totals.set(balance.currency, running.plus(balance));
  }

  return totals;
}
