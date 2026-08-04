'use client';

/**
 * One account, as a tile.
 *
 * The design system's `AccountCard` handles the layout, the masking and the money colour, so the
 * only decisions left here are the bank's: which balance leads, what the account is called when
 * the customer has not named it, and how a non-standard state is worded.
 *
 * **Available, not current.** The headline is the spendable figure, because that is the number a
 * decision gets made against. A customer looking at a ledger balance that still counts a £300
 * hold will conclude they can spend £300 they cannot.
 */

import type { Account } from '@reliance/contracts';
import { AccountCard } from '@reliance/ui';

import { ACCOUNT_STATUS_LABEL, ACCOUNT_TYPE_LABEL, CARD_STATUS_TONE, isOperable } from './labels';
import { accountRoute } from './routes';

/** What an account is called: the customer's name for it, or the product's. */
export function accountName(account: Account): string {
  return account.nickname ?? account.productName;
}

/** Props for {@link AccountTile}. */
export interface AccountTileProps {
  readonly account: Account;
  /** Marks the tile as the one the rest of the screen is scoped to. */
  readonly selected?: boolean;
}

/**
 * @example <AccountTile account={account} />
 */
export function AccountTile({ account, selected }: AccountTileProps) {
  const abnormal = !isOperable(account.status);

  return (
    <AccountCard
      name={accountName(account)}
      number={account.number}
      balance={account.balance.available.amount}
      currency={account.balance.available.currency}
      kind={ACCOUNT_TYPE_LABEL[account.type]}
      href={accountRoute(account.id)}
      selected={selected}
      {...(abnormal
        ? {
            state: {
              label: ACCOUNT_STATUS_LABEL[account.status],
              tone: CARD_STATUS_TONE[account.status],
            },
          }
        : {})}
    />
  );
}
