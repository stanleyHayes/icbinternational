'use client';

/**
 * Who the customer paid most.
 *
 * A bar per merchant, drawn as a plain element with a percentage width rather than as a chart:
 * the shape is a single dimension and a charting library would add a canvas, a tooltip and an
 * inaccessible SVG to draw what a `<div>` draws correctly. Each row is a link into the payments
 * behind it, filtered by that merchant's name, so the figure can be checked.
 *
 * The bar is `aria-hidden`; the amount beside it is the accessible content, and it is exact.
 */

import Link from 'next/link';

import type { CurrencyCode } from '@reliance/money';
import { MoneyText, cn, FOCUS_RING, TRANSITION_STATE } from '@reliance/ui';

import { EmptyPanel } from '@/components/shell';
import { bpsToPercent, shareBps } from '@/components/transactions/amounts';
import type { TransactionFilters } from '@/components/transactions/filters';
import { transactionsRoute } from '@/components/transactions/routes';
import type { MerchantTotal } from '@/components/transactions/totals';

/** Merchants listed. Beyond this the tail is noise on a leaderboard. */
const MAX_ROWS = 8;

/** Props for {@link MerchantLeaderboard}. */
export interface MerchantLeaderboardProps {
  readonly merchants: readonly MerchantTotal[];
  readonly currency: CurrencyCode;
  /** The window the figures cover, carried into each row's link. */
  readonly filters: TransactionFilters;
}

function Row({
  merchant,
  currency,
  widthPercent,
  href,
}: {
  readonly merchant: MerchantTotal;
  readonly currency: CurrencyCode;
  readonly widthPercent: number;
  readonly href: ReturnType<typeof transactionsRoute>;
}) {
  const payments = `${merchant.count} payment${merchant.count === 1 ? '' : 's'}`;

  return (
    <li>
      <Link
        href={href}
        className={cn(
          'hover:bg-surface-sunken flex flex-col gap-1 rounded-md px-2 py-2',
          FOCUS_RING,
          TRANSITION_STATE,
        )}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-fg min-w-0 truncate font-medium">{merchant.name}</span>
          <MoneyText amount={merchant.minor.toString()} currency={currency} size="sm" muted />
        </span>
        <span
          aria-hidden="true"
          className="rounded-pill bg-surface-sunken h-1.5 w-full overflow-hidden"
        >
          <span
            className="rounded-pill bg-accent block h-full"
            style={{ width: `${widthPercent}%` }}
          />
        </span>
        <span className="text-fg-muted text-xs">{payments}</span>
      </Link>
    </li>
  );
}

/**
 * @example <MerchantLeaderboard merchants={totals.byMerchant} currency="GBP" filters={filters} />
 */
export function MerchantLeaderboard({ merchants, currency, filters }: MerchantLeaderboardProps) {
  const rows = merchants.slice(0, MAX_ROWS);
  const largest = rows[0]?.minor ?? 0n;

  if (rows.length === 0) {
    return (
      <EmptyPanel
        bordered={false}
        title="Nothing to rank yet"
        description="Once there are card payments and transfers in this period, the places you spend most will be listed here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((merchant) => (
        <Row
          key={merchant.name}
          merchant={merchant}
          currency={currency}
          widthPercent={bpsToPercent(shareBps(merchant.minor, largest))}
          href={transactionsRoute({ ...filters, search: merchant.name })}
        />
      ))}
    </ul>
  );
}
