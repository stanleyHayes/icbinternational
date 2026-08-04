'use client';

/**
 * A month of spending, at a glance.
 *
 * The same derivation as the Insights donut, over the same window and under the same cache key,
 * so the two screens cannot show different totals — and, on a page the customer opens every day,
 * the figure is usually already cached by the time they reach Insights.
 *
 * Only the top few categories, each a link into the payments behind it. A snapshot that tried to
 * list nineteen categories would be the Insights screen, badly.
 */

import Link from 'next/link';

import type { CurrencyCode } from '@reliance/money';
import { MoneyText, cn, TEXT_STYLE } from '@reliance/ui';

import { Period, PERIOD_LABEL, periodFilters } from '@/components/insights/period';
import { insightsRoute } from '@/components/insights/routes';
import { useSpendPeriod } from '@/components/insights/use-spend';
import { EmptyPanel, LinkButton } from '@/components/shell';
import type { TransactionFilters } from '@/components/transactions/filters';
import { CATEGORY_LABEL } from '@/components/transactions/labels';
import { transactionsRoute } from '@/components/transactions/routes';
import { BASE_CURRENCY, type CategoryTotal } from '@/components/transactions/totals';
import { useSelectedAccount } from '@/lib/selected-account';

import { Panel } from './panel';

/** The window the snapshot covers. Matches the Insights default, so the cache is shared. */
const WINDOW = Period.LAST_30_DAYS;

/** Categories listed. */
const ROWS = 4;

const ROW_HEIGHT = 44;
const HEADLINE_HEIGHT = 72;
const BODY_HEIGHT = HEADLINE_HEIGHT + ROWS * ROW_HEIGHT;

interface BreakdownProps {
  readonly categories: readonly CategoryTotal[];
  readonly spentMinor: bigint;
  readonly currency: CurrencyCode;
  readonly filters: TransactionFilters;
}

const TOTAL_LABEL = 'Total money out';

/** The headline figure and the categories underneath it. */
function Breakdown({ categories, spentMinor, currency, filters }: BreakdownProps) {
  return (
    <>
      <div aria-live="polite">
        <p className={cn(TEXT_STYLE.caption, 'text-xs tracking-wide uppercase')}>{TOTAL_LABEL}</p>
        <MoneyText
          amount={spentMinor.toString()}
          currency={currency}
          size="xl"
          muted
          srLabel={TOTAL_LABEL}
        />
      </div>
      <ul className="mt-3 flex flex-col">
        {categories.map((entry) => (
          <li key={entry.category} className="border-border border-b last:border-0">
            <Link
              href={transactionsRoute({ ...filters, category: entry.category })}
              className="hover:text-accent flex items-center justify-between gap-3 py-2.5 text-sm"
            >
              <span className="text-fg min-w-0 truncate">{CATEGORY_LABEL[entry.category]}</span>
              <MoneyText amount={entry.minor.toString()} currency={currency} size="sm" muted />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Money out over the last month, by category. */
export function SpendSnapshot() {
  const { accountId } = useSelectedAccount();
  const filters = periodFilters(WINDOW, accountId);
  const spend = useSpendPeriod(filters);

  const currency = spend.totals?.currency ?? BASE_CURRENCY;
  const categories = (spend.totals?.byCategory ?? []).slice(0, ROWS);

  return (
    <Panel
      title="Where your money went"
      description={`${PERIOD_LABEL[WINDOW]}, across your accounts.`}
      minBodyHeight={BODY_HEIGHT}
      loading={spend.isPending}
      error={spend.error}
      action={
        <LinkButton href={insightsRoute(WINDOW)} variant="ghost">
          See the detail
        </LinkButton>
      }
    >
      {categories.length === 0 ? (
        <EmptyPanel
          bordered={false}
          title="Nothing has gone out this month"
          description="Once there are payments to look at, we will show you what they went on."
        />
      ) : (
        <Breakdown
          categories={categories}
          spentMinor={spend.totals?.spentMinor ?? 0n}
          currency={currency}
          filters={filters}
        />
      )}
    </Panel>
  );
}
