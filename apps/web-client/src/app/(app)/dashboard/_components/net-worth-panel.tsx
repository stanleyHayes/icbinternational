'use client';

/**
 * What the customer is worth with us.
 *
 * Assets, liabilities and the net position, in the customer's base currency. Liabilities are
 * shown as a negative figure rather than as a positive one labelled "owed": a table where one
 * positive number is subtracted from another positive number is a table people add up wrongly.
 *
 * Balances in other currencies are listed underneath rather than folded into the headline. The
 * conversion is the bank's estimate at a moment in time, and presenting it as a single certain
 * figure would be the one number on the page that is not exact.
 */

import type { NetWorth } from '@reliance/contracts';
import { MoneyText, Skeleton, cn, TEXT_STYLE } from '@reliance/ui';

import { useNetWorth } from '@/components/accounts/use-accounts';
import { formatDateTime } from '@/lib/format';

/** Reserved height of the figures block, so nothing under it moves when they land. */
const BODY_HEIGHT = 132;

function Figure({
  label,
  amount,
  currency,
  lead,
  signed,
}: {
  readonly label: string;
  readonly amount: string;
  readonly currency: NetWorth['baseCurrency'];
  readonly lead?: boolean;
  readonly signed?: boolean;
}) {
  return (
    <div>
      <p className={cn(TEXT_STYLE.caption, 'text-xs tracking-wide uppercase')}>{label}</p>
      <MoneyText
        amount={amount}
        currency={currency}
        size={lead ? 'display' : 'lg'}
        signed={signed}
        muted={lead}
        srLabel={label}
      />
    </div>
  );
}

function ByCurrency({ position }: { readonly position: NetWorth }) {
  const others = position.byCurrency.filter((entry) => entry.currency !== position.baseCurrency);
  if (others.length === 0) return null;

  return (
    <p className={cn(TEXT_STYLE.caption, 'flex flex-wrap items-center gap-x-3 gap-y-1')}>
      <span>Also held:</span>
      {others.map((entry) => (
        <MoneyText
          key={entry.currency}
          amount={entry.total.amount}
          currency={entry.currency}
          size="sm"
          muted
        />
      ))}
    </p>
  );
}

/** The panel's frame, which is the same size whether or not the figures have arrived. */
const FRAME = 'rounded-lg border border-border bg-surface p-5';
const RESERVED = { minHeight: `${BODY_HEIGHT}px` };

function Pending() {
  return (
    <div className={FRAME} style={RESERVED}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-10 w-56" />
      <Skeleton className="mt-4 h-3 w-64" />
    </div>
  );
}

function Figures({ position }: { readonly position: NetWorth }) {
  const owed = BigInt(position.totalLiabilities.amount);

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
      <Figure
        label="Everything you hold with us"
        amount={position.net.amount}
        currency={position.baseCurrency}
        lead
      />
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <Figure
          label="In your accounts"
          amount={position.totalAssets.amount}
          currency={position.baseCurrency}
        />
        <Figure
          label="What you owe us"
          amount={(-owed).toString()}
          currency={position.baseCurrency}
          signed
        />
      </div>
    </div>
  );
}

/** The aggregate position across every account. */
export function NetWorthPanel() {
  const position = useNetWorth();

  if (position.isPending) return <Pending />;
  if (position.isError || !position.data) return null;

  const { data } = position;

  return (
    <section
      aria-label="Your overall position"
      aria-live="polite"
      className={FRAME}
      style={RESERVED}
    >
      <Figures position={data} />
      <div className="mt-4 flex flex-col gap-1">
        <ByCurrency position={data} />
        <p className={cn(TEXT_STYLE.caption, 'text-xs')}>{`As at ${formatDateTime(data.asOf)}`}</p>
      </div>
    </section>
  );
}
