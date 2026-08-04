'use client';

/**
 * One standing order in the list.
 *
 * The next payment date is the headline, because that is what somebody checks before payday. A
 * failing order is called out in words as well as in tone — "payments are failing" is the state
 * that costs a customer a late fee if they do not notice it.
 */

import Link from 'next/link';

import type { TransferOrder } from '@reliance/contracts';
import { cn, MoneyText, StatusPill } from '@reliance/ui';

import { laneRoutes, ORDER_STATUS } from '@/components/transfers';
import { formatDate } from '@/lib/format';

import { FREQUENCY_LABEL } from './frequency';

/** Props for {@link OrderRow}. */
export interface OrderRowProps {
  readonly order: TransferOrder;
}

/** When it next goes out, or why it never will again. */
function nextRunLine(order: TransferOrder): string {
  if (order.nextRunAt) return `Next payment ${formatDate(order.nextRunAt)}`;
  if (order.consecutiveFailures > 0) return 'We could not take the last payment';
  return 'No further payments scheduled';
}

/**
 * @example <OrderRow order={order} />
 */
export function OrderRow({ order }: OrderRowProps) {
  const status = ORDER_STATUS[order.status];

  return (
    <li className="border-border border-b last:border-0">
      <Link
        href={laneRoutes.scheduled.detail(order.id)}
        className={cn(
          'hover:bg-surface-sunken flex items-center justify-between gap-3 rounded-md px-3 py-3',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <span className="min-w-0">
          <span className="text-fg block truncate text-sm font-medium">{order.name}</span>
          <span className="text-fg-muted mt-0.5 block truncate text-xs">
            {FREQUENCY_LABEL[order.frequency]} · {nextRunLine(order)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <StatusPill tone={status.tone} label={status.label} />
          <MoneyText
            amount={order.amount.amount}
            currency={order.amount.currency}
            srLabel="Amount of each payment"
          />
        </span>
      </Link>
    </li>
  );
}
