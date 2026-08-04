import { Injectable } from '@nestjs/common';

import { AccountStatus } from '@reliance/contracts';
import { convert, formatRate, Money, type CurrencyCode } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored } from '../../common/money/money.codec.js';
import { AccountStore, type AccountRecord } from '../accounts/index.js';
import { UsersService } from '../auth/users/index.js';
import { RateProviderPort } from '../fx/index.js';

import { type WalletOverview, type WalletPosition } from './wallet.types.js';

/**
 * A balance per currency, and one total the customer can act on.
 *
 * **Booked, not spendable, in the total.** Net worth uses the ledger balance and ignores
 * holds and overdraft facilities. A hold is money you still own but cannot spend this
 * second; an unused overdraft is somebody else's money. Counting either would make the
 * headline figure answer a different question from the one that was asked.
 *
 * **A wallet the bank cannot price is named, not dropped.** It keeps its own exact balance
 * and its currency appears in `unpriced`, so the customer can see precisely what the total
 * leaves out. A total that quietly omits a wallet is a wrong number wearing a right one's
 * clothes.
 *
 * **Mid-market for valuation.** The customer is not trading, so no spread is applied. The
 * spread applies when value actually changes hands, and only then.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly accounts: AccountStore,
    private readonly rates: RateProviderPort,
    private readonly users: UsersService,
    private readonly clock: ClockService,
  ) {}

  /** Every open wallet the customer holds, valued in their base currency. */
  async positions(userId: string): Promise<readonly WalletPosition[]> {
    const user = await this.users.requireById(userId);
    const base = user.baseCurrency as CurrencyCode;
    const records = (await this.accounts.listByUser({ userId })).filter(isOpen);

    const positions: WalletPosition[] = [];
    for (const record of records) {
      positions.push(await this.valueOf(record, base));
    }

    return positions;
  }

  /** The consolidated position: every wallet, plus the totals derived from them. */
  async overview(userId: string): Promise<WalletOverview> {
    const user = await this.users.requireById(userId);
    const baseCurrency = user.baseCurrency as CurrencyCode;
    const positions = await this.positions(userId);

    return {
      baseCurrency,
      positions,
      ...totalsOf(positions, baseCurrency),
      byCurrency: perCurrency(positions),
      unpriced: unpricedCurrencies(positions),
      asOf: this.clock.now(),
    };
  }

  /** One account as a wallet position, priced at mid where the bank quotes the pair. */
  private async valueOf(record: AccountRecord, base: CurrencyCode): Promise<WalletPosition> {
    const ledger = fromStored(record.ledgerBalance);
    const available = fromStored(record.availableBalance);
    const common = {
      accountId: record.id,
      currency: ledger.currency,
      name: record.nickname ?? record.productName,
      ledger,
      available,
    };

    if (ledger.currency === base) {
      return { ...common, baseEquivalent: ledger, rate: null };
    }

    const quote = await this.rates.midFor(ledger.currency, base);
    if (!quote) return { ...common, baseEquivalent: null, rate: null };

    return {
      ...common,
      baseEquivalent: convert(ledger, quote.rate),
      rate: formatRate(quote.rate),
    };
  }
}

/** A closed account holds nothing and belongs in no total. */
function isOpen(account: AccountRecord): boolean {
  return account.status !== AccountStatus.CLOSED;
}

/** Assets, liabilities and the net figure, classified per account. */
function totalsOf(
  positions: readonly WalletPosition[],
  baseCurrency: CurrencyCode,
): Pick<WalletOverview, 'totalAssets' | 'totalLiabilities' | 'net'> {
  let totalAssets = Money.zero(baseCurrency);
  let totalLiabilities = Money.zero(baseCurrency);

  for (const position of positions) {
    const value = position.baseEquivalent;
    if (!value) continue;

    if (value.isNegative) {
      totalLiabilities = totalLiabilities.plus(value.abs());
    } else {
      totalAssets = totalAssets.plus(value);
    }
  }

  return { totalAssets, totalLiabilities, net: totalAssets.minus(totalLiabilities) };
}

/** Exact per-currency totals. No rate is involved, so none of these can be approximate. */
function perCurrency(
  positions: readonly WalletPosition[],
): readonly { currency: CurrencyCode; total: Money }[] {
  const totals = new Map<CurrencyCode, Money>();

  for (const position of positions) {
    const running = totals.get(position.currency) ?? Money.zero(position.currency);
    totals.set(position.currency, running.plus(position.ledger));
  }

  return [...totals].map(([currency, total]) => ({ currency, total }));
}

/** Currencies the totals had to leave out, so the omission is visible rather than silent. */
function unpricedCurrencies(positions: readonly WalletPosition[]): readonly CurrencyCode[] {
  return [
    ...new Set(
      positions
        .filter((position) => position.baseEquivalent === null)
        .map((position) => position.currency),
    ),
  ];
}
