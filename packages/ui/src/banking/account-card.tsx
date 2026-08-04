'use client';

/**
 * AccountCard — one account in a list or carousel.
 *
 * Renders as a link or a button rather than a clickable div, so it appears in the tab order and
 * in a screen reader's list of links. Its accessible name is the account name plus the masked
 * number: in a wallet with three current accounts, "Current account" alone identifies nothing.
 *
 * Only the last four digits of an account number are ever rendered. Masking at the component
 * boundary means a screen that accidentally passes a full number still cannot display one.
 */

import { type ReactNode } from 'react';

import { type CurrencyCode } from '@reliance/money';

import { Badge } from '../composites/badge.js';
import { FOCUS_RING, TRANSITION_STATE } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { MoneyText } from './money-text.js';

/** Digits of an account or card number that may be shown. */
const VISIBLE_DIGITS = 4;
const MASK = '••••';

/** `"40308012345678"` → `"•••• 5678"`. Anything shorter is already safe to show. */
export function maskNumber(accountNumber: string): string {
  const tail = accountNumber.slice(-VISIBLE_DIGITS);
  return accountNumber.length > VISIBLE_DIGITS ? `${MASK} ${tail}` : tail;
}

export interface AccountCardProps {
  readonly name: string;
  /** Full or partial number — only the last four digits are rendered. */
  readonly number: string;
  /** Minor units. */
  readonly balance: string;
  readonly currency: CurrencyCode;
  /** "Current", "Savings", "Foreign currency". */
  readonly kind?: string;
  /** Marks the account as frozen, closed or pending — shown as a badge, not just a tint. */
  readonly state?: { readonly label: string; readonly tone: 'pending' | 'danger' | 'neutral' };
  /** Renders an anchor when set, a button otherwise. */
  readonly href?: string;
  readonly onSelect?: () => void;
  readonly icon?: ReactNode;
  readonly selected?: boolean;
  readonly className?: string;
}

/**
 * @example
 * <AccountCard name="Everyday" number="40308012345678" balance="482350" currency="GBP" kind="Current" />
 */
export function AccountCard(props: AccountCardProps) {
  const { name, number, balance, currency, kind, state, href, onSelect, icon, selected } = props;
  const masked = maskNumber(number);

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <span className="text-ink shrink-0">{icon}</span>}
          <div className="flex min-w-0 flex-col">
            <span className="font-display text-fg truncate text-base font-semibold">{name}</span>
            <span className="text-fg-muted font-mono text-xs">{masked}</span>
          </div>
        </div>
        {state ? <Badge tone={state.tone}>{state.label}</Badge> : kind && <Badge>{kind}</Badge>}
      </div>
      <MoneyText
        amount={balance}
        currency={currency}
        size="xl"
        muted
        srLabel="Balance"
        className="mt-4 block"
      />
    </>
  );

  const className = cn(
    'flex w-full flex-col rounded-lg border bg-surface p-5 text-left',
    selected ? 'border-accent shadow-sm' : 'border-border hover:border-border-strong',
    FOCUS_RING,
    TRANSITION_STATE,
    props.className,
  );

  // No `aria-label`: it would *replace* the card's text, and the balance is the one thing a
  // customer is here to hear. The content already reads as "Everyday, •••• 5678, Balance £4,823.50".
  return href ? (
    <a href={href} className={className}>
      {content}
    </a>
  ) : (
    <button type="button" onClick={onSelect} className={className}>
      {content}
    </button>
  );
}
