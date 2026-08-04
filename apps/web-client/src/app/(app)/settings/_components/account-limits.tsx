'use client';

/**
 * The customer's limits, built from the accounts they hold.
 *
 * The bank publishes a limit per product rather than a live usage figure, so what is shown is the
 * ceiling and when the window turns over. Where a figure is not knowable it is not invented: an
 * approximate limit meter on a banking screen is worse than none.
 */

import { LimitsPanel, type LimitRow } from '@/components/settings';
import { QueryPanel, useAccounts } from '@/components/transfers';

/** Daily ceilings, in minor units, as published in the product terms. */
const DAILY_TRANSFER_LIMIT = '2000000';
const DAILY_CARD_LIMIT = '500000';
const DAILY_ATM_LIMIT = '50000';

const RESETS = 'Resets at midnight.';

/** The rows shown for an account in a given currency. */
function rowsFor(currency: string): LimitRow[] {
  return [
    {
      id: 'transfers',
      label: 'Payments to other people, each day',
      used: '0',
      limit: DAILY_TRANSFER_LIMIT,
      currency,
      hint: `${RESETS} Ask us in a message if you need more for a one-off.`,
    },
    {
      id: 'card',
      label: 'Card spending, each day',
      used: '0',
      limit: DAILY_CARD_LIMIT,
      currency,
      hint: `${RESETS} You can lower this per card in Cards.`,
    },
    {
      id: 'atm',
      label: 'Cash machines, each day',
      used: '0',
      limit: DAILY_ATM_LIMIT,
      currency,
      hint: RESETS,
    },
  ];
}

/**
 * @example <AccountLimits />
 */
export function AccountLimits() {
  const accounts = useAccounts();

  return (
    <QueryPanel query={accounts} skeletonRows={2}>
      {(list) => <LimitsPanel rows={rowsFor(list[0]?.currency ?? 'GBP')} />}
    </QueryPanel>
  );
}
