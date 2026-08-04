import { type NetWorth } from '@reliance/contracts';

import { toWire } from '../../common/money/money.codec.js';
import { toIso } from '../accounts/index.js';

import { type WalletOverview } from './wallet.types.js';

/**
 * A wallet overview, projected onto the contract's net-worth shape.
 *
 * The contract has no field for "currencies we could not price", so an overview with any
 * unpriced wallet is **not** projected: `NetWorth` promises a total across everything the
 * customer holds, and silently returning a smaller number under that name would be a wrong
 * figure the customer has no way to detect. The caller is expected to check
 * {@link WalletOverview.unpriced} first and say so in its own words.
 */
export function toContractNetWorth(overview: WalletOverview): NetWorth {
  return {
    baseCurrency: overview.baseCurrency,
    totalAssets: toWire(overview.totalAssets),
    totalLiabilities: toWire(overview.totalLiabilities),
    net: toWire(overview.net),
    byCurrency: overview.byCurrency.map((entry) => ({
      currency: entry.currency,
      total: toWire(entry.total),
    })),
    asOf: toIso(overview.asOf),
  };
}

/** Whether every wallet in the overview could be valued. */
export function isFullyPriced(overview: WalletOverview): boolean {
  return overview.unpriced.length === 0;
}
