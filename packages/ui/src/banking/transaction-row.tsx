'use client';

/**
 * TransactionRow — one line of the activity list.
 *
 * The row is the densest thing in the product and the most read, so the ordering is fixed:
 * counterparty first (what the customer scans for), then context, then the amount hard-right
 * where tabular digits make a column of figures comparable at a glance.
 *
 * A pending transaction is marked in words as well as in gold. "Pending" is the difference
 * between money that has left and money that might yet not, and colour cannot carry that alone.
 */

import { type ReactNode } from 'react';

import { type CurrencyCode } from '@reliance/money';

import { Avatar } from '../composites/avatar.js';
import { StatusPill } from '../composites/status-pill.js';
import { FOCUS_RING_INSET, TRANSITION_STATE } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { MoneyText } from './money-text.js';

export interface TransactionRowProps {
  /** Merchant or payee, as the customer would recognise it. */
  readonly counterparty: string;
  /** Signed minor units: negative for money out. */
  readonly amount: string;
  readonly currency: CurrencyCode;
  /** Already-formatted date or relative time — formatting is the app's locale decision. */
  readonly when: string;
  /** Category, method, or reference — one short line. */
  readonly detail?: string;
  /** Authorised but not settled. Renders the amount in gold and adds a "Pending" pill. */
  readonly pending?: boolean;
  /** Overrides the pending pill for other states: "Reversed", "Disputed", "Failed". */
  readonly status?: { readonly label: string; readonly tone: 'pending' | 'danger' | 'neutral' };
  /** Replaces the initials avatar — a category glyph or a merchant logo. */
  readonly icon?: ReactNode;
  /** Running balance after this transaction, in minor units. Statement views only. */
  readonly balanceAfter?: string;
  readonly onSelect?: () => void;
  readonly className?: string;
}

const PENDING_STATUS = { label: 'Pending', tone: 'pending' } as const;

function RowBody(props: TransactionRowProps) {
  const { counterparty, amount, currency, when, detail, pending, icon, balanceAfter } = props;
  const status = props.status ?? (pending ? PENDING_STATUS : undefined);

  return (
    <>
      {icon ?? <Avatar name={counterparty} size="sm" />}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-body text-fg truncate font-medium">{counterparty}</span>
        <span className="font-body text-fg-muted truncate text-sm">
          {when}
          {detail && ` · ${detail}`}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <MoneyText amount={amount} currency={currency} signed pending={pending} />
        {status ? (
          <StatusPill tone={status.tone} label={status.label} live={status.tone === 'pending'} />
        ) : (
          balanceAfter && (
            <MoneyText
              amount={balanceAfter}
              currency={currency}
              size="sm"
              muted
              srLabel="Balance after"
              className="text-fg-subtle"
            />
          )
        )}
      </div>
    </>
  );
}

/**
 * @example
 * <TransactionRow counterparty="Tesco" amount="-4250" currency="GBP" when="Today, 14:02" pending />
 */
export function TransactionRow(props: TransactionRowProps) {
  const { onSelect, className } = props;
  const shared = 'flex w-full items-center gap-3 px-4 py-3 text-left';

  if (!onSelect) {
    return (
      <div className={cn(shared, className)}>
        <RowBody {...props} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        shared,
        'hover:bg-surface-sunken',
        FOCUS_RING_INSET,
        TRANSITION_STATE,
        className,
      )}
    >
      <RowBody {...props} />
    </button>
  );
}
