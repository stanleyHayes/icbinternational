'use client';

/**
 * The account picker in the top bar.
 *
 * It shows balances, which makes it the most-read control in the app, so the figures go through
 * `MoneyText` like every other figure: tabular digits, currency-aware, coloured by sign. A balance
 * formatted by hand here would be the one number in the bank that disagrees with the rest.
 *
 * Availability, not the ledger balance, is what a customer is choosing between — the question
 * behind opening this menu is almost always "which of these can I spend from".
 *
 * Deliberately a **disclosure**, not an ARIA menu. `role="menu"` is a promise of the whole WAI-ARIA
 * menu keyboard model — arrow-key roving focus, Home/End, type-ahead — and a `role="menu"` may only
 * own menu items, not the caption and list this panel needs. A screen-reader user told "menu"
 * presses Down and expects it to work. A disclosure of ordinary buttons promises Tab and Enter,
 * which is exactly what this delivers: a simpler contract, met in full.
 */

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Wallet } from 'lucide-react';
import type { RefObject } from 'react';

import type { Account } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import { Button, cn, maskNumber, MoneyText, Skeleton, TEXT_STYLE } from '@reliance/ui';

import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useSelectedAccount } from '@/lib/selected-account';

import { usePopover } from './use-popover';

const ALL_ACCOUNTS = 'All accounts';

/** The trigger points `aria-controls` here, but only while the panel is actually in the DOM. */
const PANEL_ID = 'account-switcher-panel';

function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts.list(),
    queryFn: async () => (await browserApi().accounts.list()).data,
  });
}

interface RowProps {
  readonly label: string;
  readonly detail: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly amount?: { readonly value: string; readonly currency: CurrencyCode };
}

function Row({ label, detail, selected, onSelect, amount }: RowProps) {
  return (
    <li>
      <button
        type="button"
        // `aria-current` rather than `aria-checked`: this is the account in force, and unlike a
        // radio it carries no keyboard contract an ordinary button cannot honour.
        aria-current={selected}
        onClick={onSelect}
        className={cn(
          'hover:bg-surface-sunken flex w-full items-center gap-3 px-3 py-2.5 text-left',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
        )}
      >
        <Check
          aria-hidden="true"
          className={cn('text-accent size-4 shrink-0', !selected && 'invisible')}
        />
        <span className="min-w-0 flex-1">
          <span className="text-fg block truncate text-sm font-medium">{label}</span>
          <span className="text-fg-subtle block truncate text-xs">{detail}</span>
        </span>
        {amount ? (
          <MoneyText
            amount={amount.value}
            currency={amount.currency}
            size="sm"
            muted
            srLabel="Available"
          />
        ) : null}
      </button>
    </li>
  );
}

interface TriggerProps {
  readonly ref: RefObject<HTMLButtonElement | null>;
  readonly label: string;
  readonly open: boolean;
  readonly onToggle: () => void;
}

function Trigger({ ref, label, open, onToggle }: TriggerProps) {
  return (
    <Button
      ref={ref}
      variant="secondary"
      size="sm"
      aria-expanded={open}
      // Referencing an id that is not in the document is an invalid IDREF, so the association is
      // only claimed while the panel exists.
      {...(open ? { 'aria-controls': PANEL_ID } : {})}
      onClick={onToggle}
      startIcon={<Wallet aria-hidden="true" className="size-4" />}
      endIcon={<ChevronDown aria-hidden="true" className="size-4" />}
    >
      <span className="max-w-40 truncate">{label}</span>
    </Button>
  );
}

/** Switches the account every screen in the shell is scoped to. */
export function AccountSwitcher() {
  const { open, toggle, close, triggerRef, panelRef } = usePopover();
  const { accountId, select } = useSelectedAccount();
  const { data: accounts, isPending } = useAccounts();

  const current = accounts?.find((account) => account.id === accountId);
  const label = current ? (current.nickname ?? current.productName) : ALL_ACCOUNTS;

  function choose(next: string | null): void {
    select(next);
    close();
    triggerRef.current?.focus();
  }

  return (
    <div className="relative">
      <Trigger ref={triggerRef} label={label} open={open} onToggle={toggle} />

      {open ? (
        <div
          ref={panelRef}
          id={PANEL_ID}
          className="border-border bg-surface-raised absolute left-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border shadow-lg"
        >
          <AccountMenu
            accounts={accounts}
            loading={isPending}
            selectedId={accountId}
            onChoose={choose}
          />
        </div>
      ) : null}
    </div>
  );
}

interface MenuProps {
  readonly accounts: readonly Account[] | undefined;
  readonly loading: boolean;
  readonly selectedId: string | null;
  readonly onChoose: (accountId: string | null) => void;
}

function AccountMenu({ accounts, loading, selectedId, onChoose }: MenuProps) {
  return (
    <>
      <p className={cn(TEXT_STYLE.caption, 'border-border border-b px-3 py-2 text-xs')}>
        Available to spend
      </p>
      <ul aria-label="Accounts" className="max-h-80 overflow-y-auto py-1">
        <Row
          label={ALL_ACCOUNTS}
          detail="Everything you hold with us"
          selected={selectedId === null}
          onSelect={() => onChoose(null)}
        />
        {loading ? (
          <li className="px-3 py-2.5">
            <Skeleton className="h-4 w-40" />
          </li>
        ) : null}
        {accounts?.map((account) => (
          <Row
            key={account.id}
            label={account.nickname ?? account.productName}
            detail={`${maskNumber(account.number)} · ${account.currency}`}
            selected={account.id === selectedId}
            onSelect={() => onChoose(account.id)}
            amount={{ value: account.balance.available.amount, currency: account.currency }}
          />
        ))}
      </ul>
    </>
  );
}
