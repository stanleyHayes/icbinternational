'use client';

/**
 * Budgets, and the alerts attached to them.
 *
 * The bar comes from the design system's `LimitMeter`, which puts the *money* in
 * `aria-valuetext` — "£274.50 of £400.00 used" rather than "68 percent", because the percentage
 * is not the number anyone is deciding on.
 *
 * A budget over its alert threshold says so in words as well as in colour, and a budget that has
 * been exceeded says by how much. "You are over" with no figure is an anxiety, not information.
 *
 * Each budget states the period it covers. Budgets run on their own calendar month, which is not
 * necessarily the window the charts above are showing, and leaving that implicit is how two
 * honest figures on one page come to look like a contradiction.
 */

import type { Budget } from '@reliance/contracts';
import { Alert, LimitMeter, MoneyText, Skeleton, cn, TEXT_STYLE } from '@reliance/ui';

import { EmptyPanel } from '@/components/shell';
import { CATEGORY_LABEL } from '@/components/transactions/labels';
import { describeError } from '@/lib/errors';
import { formatDate } from '@/lib/format';

import { useBudgets } from './use-insights';

const BPS_PER_PERCENT = 100;

function overspend(budget: Budget): bigint {
  const spent = BigInt(budget.spent.amount);
  const limit = BigInt(budget.limit.amount);
  return spent > limit ? spent - limit : 0n;
}

function BudgetRow({ budget }: { readonly budget: Budget }) {
  const over = overspend(budget);
  const approaching = over === 0n && budget.utilisationBps >= budget.alertAtBps;

  return (
    <li className="border-border flex flex-col gap-2 border-b py-4 last:border-0">
      <LimitMeter
        label={CATEGORY_LABEL[budget.category]}
        used={budget.spent.amount}
        limit={budget.limit.amount}
        currency={budget.limit.currency}
        hint={`${formatDate(budget.periodStart)} to ${formatDate(budget.periodEnd)}`}
      />
      {over > 0n ? (
        <p className="text-debit text-sm">
          <span className="font-medium">Over budget by </span>
          <MoneyText amount={over.toString()} currency={budget.limit.currency} size="sm" muted />
          <span>. Anything else in this category comes out of the rest of your money.</span>
        </p>
      ) : null}
      {approaching ? (
        <p className="text-pending text-sm">
          {`You have used ${Math.trunc(budget.utilisationBps / BPS_PER_PERCENT)}% of this budget, which is where you asked us to tell you.`}
        </p>
      ) : null}
    </li>
  );
}

/** Budgets and their progress. */
export function BudgetList() {
  const budgets = useBudgets();

  if (budgets.isPending) return <Skeleton className="h-48 w-full" />;

  if (budgets.isError) {
    return (
      <Alert tone="warning" title="We could not load your budgets">
        {describeError(budgets.error).message}
      </Alert>
    );
  }

  if (budgets.data.length === 0) {
    return (
      <EmptyPanel
        bordered={false}
        title="No budgets set"
        description="Set a monthly limit on a category and we will tell you when you are getting close to it, before you go past."
      />
    );
  }

  return (
    <>
      <ul>
        {budgets.data.map((budget) => (
          <BudgetRow key={budget.id} budget={budget} />
        ))}
      </ul>
      <p className={cn(TEXT_STYLE.caption, 'mt-3')}>
        Budgets run on their own calendar month, so these figures may cover a different period from
        the charts above.
      </p>
    </>
  );
}
