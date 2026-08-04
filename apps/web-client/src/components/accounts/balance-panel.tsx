'use client';

/**
 * The balance block at the top of an account.
 *
 * Four figures, and the order is the argument. Available leads because it is the only one a
 * spending decision may be made against. Current sits beside it because it is what a statement
 * will say. Held and overdraft headroom are spelled out underneath, because the gap between the
 * first two numbers is otherwise unexplained — and an unexplained gap in a bank balance is the
 * single most common reason a customer picks up the phone.
 *
 * `aria-live` covers the two figures and nothing else. The shell revalidates on focus, so they can
 * change while the customer is looking at them — but a live region drawn around the whole panel
 * re-reads the breakdown cards and the quick actions on every revalidation, which buries the one
 * fact that moved. The region here carries the figures alone.
 */

import type { ReactNode } from 'react';

import type { Account } from '@reliance/contracts';
import { Money } from '@reliance/money';
import { BalanceCard, Card, CardHeader, MoneyText, cn, TEXT_STYLE } from '@reliance/ui';

import { formatDateTime } from '@/lib/format';

import { ACCOUNT_STATUS_EXPLANATION, isOperable } from './labels';

function HoldExplanation({ account }: { readonly account: Account }) {
  const { held, overdraftAvailable } = account.balance;
  const currency = account.balance.available.currency;
  const hasHold = BigInt(held.amount) !== 0n;
  const hasOverdraft = BigInt(overdraftAvailable.amount) !== 0n;

  if (!hasHold && !hasOverdraft) return null;

  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2">
      {hasHold ? (
        <div>
          <dt className={cn(TEXT_STYLE.caption)}>On hold</dt>
          <dd>
            <MoneyText amount={held.amount} currency={currency} muted />
            <span className="text-fg-muted ml-2 text-sm">
              Card payments authorised but not yet taken
            </span>
          </dd>
        </div>
      ) : null}
      {hasOverdraft ? (
        <div>
          <dt className={cn(TEXT_STYLE.caption)}>Overdraft left</dt>
          <dd>
            <MoneyText amount={overdraftAvailable.amount} currency={currency} muted />
            <span className="text-fg-muted ml-2 text-sm">Interest applies once you use it</span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

const AVAILABLE_LABEL = 'Available balance';
const CURRENT_LABEL = 'Current balance';

interface BalanceFiguresProps {
  readonly available: Account['balance']['available'];
  readonly ledger: Account['balance']['ledger'];
}

/**
 * The two headline figures, and the only thing on this screen that is announced when it moves.
 *
 * Visually hidden and therefore duplicated: `BalanceCard` renders the figures, its label and the
 * quick actions inside one element, so the live region cannot be drawn around the numbers alone
 * without owning the buttons too. A hidden region holding only the numbers is the narrower
 * boundary, and the one that leaves the customer with a single sentence rather than the panel.
 */
function BalanceFigures({ available, ledger }: BalanceFiguresProps) {
  const currency = available.currency;
  const availableText = Money.fromMinor(available.amount, currency).format();
  const currentText = Money.fromMinor(ledger.amount, currency).format();

  return (
    <p aria-live="polite" className="sr-only">
      {`${AVAILABLE_LABEL} ${availableText}, ${CURRENT_LABEL} ${currentText}`}
    </p>
  );
}

/** Props for {@link BalancePanel}. */
export interface BalancePanelProps {
  readonly account: Account;
  /** Quick actions — send money, add money, view statements. */
  readonly actions?: ReactNode;
}

/**
 * @example <BalancePanel account={account} actions={<LinkButton …>Send money</LinkButton>} />
 */
export function BalancePanel({ account, actions }: BalancePanelProps) {
  const { available, ledger, asOf } = account.balance;

  return (
    <div className="flex flex-col gap-4">
      <BalanceFigures available={available} ledger={ledger} />

      <BalanceCard
        label={AVAILABLE_LABEL}
        amount={available.amount}
        currency={available.currency}
        secondary={{ label: CURRENT_LABEL, amount: ledger.amount }}
        actions={actions}
      />

      <Card>
        <CardHeader
          title="What makes up this balance"
          description={`As at ${formatDateTime(asOf)}`}
        />
        <div className="mt-4 flex flex-col gap-3">
          <HoldExplanation account={account} />
          {isOperable(account.status) ? null : (
            <p className="text-fg text-sm">{ACCOUNT_STATUS_EXPLANATION[account.status]}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
