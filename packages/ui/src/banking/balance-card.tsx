/**
 * BalanceCard — the headline figure on the dashboard.
 *
 * "Available" and "current" are different numbers and confusing them costs people money, so both
 * are first-class: the headline is whichever the caller leads with, and the other sits beneath it
 * labelled, rather than being left for the customer to discover in a statement.
 *
 * The loading state reserves the same height as the loaded one. A balance that arrives late and
 * pushes the quick actions down the page is how someone taps "Freeze card" instead of "Send".
 */

import { type ReactNode } from 'react';

import { type CurrencyCode } from '@reliance/money';

import { Card } from '../composites/card.js';
import { Skeleton } from '../composites/skeleton.js';
import { cn } from '../lib/cn.js';

import { MoneyText } from './money-text.js';

/** A labelled figure in minor units. */
export interface LabelledAmount {
  readonly label: string;
  /** Minor units. */
  readonly amount: string;
}

export interface BalanceCardProps {
  /** What the headline figure is — "Available balance". */
  readonly label: string;
  /** Minor units. */
  readonly amount: string;
  readonly currency: CurrencyCode;
  /** The other balance — typically the current balance when the headline is available. */
  readonly secondary?: LabelledAmount;
  /** Movement over the stated period, in minor units. Signed. */
  readonly delta?: LabelledAmount;
  /** Quick actions — Send, Add money, Freeze. */
  readonly actions?: ReactNode;
  readonly loading?: boolean;
  readonly className?: string;
}

function BalanceSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton shape="text" className="h-3 w-28" />
      <Skeleton shape="block" className="h-10 w-56" />
      <Skeleton shape="text" className="h-3 w-40" />
    </div>
  );
}

/**
 * @example
 * <BalanceCard
 *   label="Available balance"
 *   amount="482350"
 *   currency="GBP"
 *   secondary={{ label: 'Current balance', amount: '495000' }}
 * />
 */
export function BalanceCard(props: BalanceCardProps) {
  const { label, amount, currency, secondary, delta, actions, loading, className } = props;

  return (
    <Card elevation="raised" className={cn('flex flex-col gap-4', className)}>
      {loading ? (
        <BalanceSkeleton />
      ) : (
        <div className="flex flex-col gap-1">
          <p className="font-body text-fg-muted text-sm">{label}</p>
          {/* `muted` because the headline balance is a statement of fact, not a movement:
              painting a healthy balance green and an overdrawn one red is a judgement the
              dashboard should not be making every time the customer opens the app. */}
          <MoneyText amount={amount} currency={currency} size="display" muted srLabel={label} />
          <div className="font-body text-fg-muted mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {secondary && (
              <span className="flex items-center gap-1.5">
                {secondary.label}
                <MoneyText amount={secondary.amount} currency={currency} size="sm" muted />
              </span>
            )}
            {delta && (
              <span className="flex items-center gap-1.5">
                <MoneyText amount={delta.amount} currency={currency} size="sm" signed />
                {delta.label}
              </span>
            )}
          </div>
        </div>
      )}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </Card>
  );
}
