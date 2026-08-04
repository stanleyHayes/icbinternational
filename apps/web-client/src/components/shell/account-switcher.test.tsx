// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under this
// workspace's pnpm layout, and `tsconfig.json` is shared configuration this app does not own.
// The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

/**
 * The switcher used to claim `role="menu"` without any of the WAI-ARIA menu keyboard model, and
 * with a caption and a list inside it that a menu may not own.
 *
 * These tests hold it to the contract it now advertises: a disclosure of ordinary buttons, where
 * Tab reaches every option, Escape closes and returns focus, and `aria-controls` names an element
 * that is actually in the document.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

import { AccountStatus, AccountType, type Account } from '@reliance/contracts';

import { SelectedAccountProvider } from '@/lib/selected-account';

import { setupUser } from '../../test/user';

import { AccountSwitcher } from './account-switcher';

const SAVINGS_NICKNAME = 'Rainy day';

function account(id: string, nickname: string): Account {
  return {
    id,
    userId: 'usr_11111111111111111111111111',
    type: AccountType.SAVINGS,
    status: AccountStatus.ACTIVE,
    currency: 'GBP',
    productCode: 'RB-SAVINGS',
    productName: 'Reliance Savings',
    nickname,
    number: '12345678',
    sortCode: '040404',
    iban: 'GB29RLNC04040412345678',
    balance: {
      ledger: { amount: '495000', currency: 'GBP' },
      available: { amount: '482350', currency: 'GBP' },
      held: { amount: '12650', currency: 'GBP' },
      overdraftAvailable: { amount: '0', currency: 'GBP' },
      asOf: '2026-08-03T09:00:00.000Z',
    },
    holderIds: ['usr_11111111111111111111111111'],
    interestRateBps: 425,
    isPrimary: false,
    openedAt: '2024-01-05T09:00:00.000Z',
    closedAt: null,
  } as Account;
}

const ACCOUNTS = [account('acc_11111111111111111111111111', SAVINGS_NICKNAME)];

jest.mock('@/lib/api', () => ({
  browserApi: () => ({ accounts: { list: async () => ({ data: ACCOUNTS }) } }),
}));

function mount(): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SelectedAccountProvider>
        <AccountSwitcher />
      </SelectedAccountProvider>
    </QueryClientProvider>
  );
}

async function openPanel(): Promise<HTMLElement> {
  const user = setupUser();
  render(mount());
  const trigger = screen.getByRole('button', { name: /all accounts/i });
  await user.click(trigger);
  await screen.findByRole('button', { name: new RegExp(SAVINGS_NICKNAME, 'i') });
  return trigger;
}

describe('AccountSwitcher', () => {
  it('does not advertise a menu it cannot implement', async () => {
    const trigger = await openPanel();

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    expect(trigger.getAttribute('aria-haspopup')).toBeNull();
  });

  it('exposes every option as a button, so Tab reaches all of them', async () => {
    await openPanel();

    const options = screen.getAllByRole('button', { name: /all accounts|rainy day/i });
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const option of options) expect(option.tagName).toBe('BUTTON');
  });

  it('marks the account in force with aria-current', async () => {
    await openPanel();

    const chosen = screen.getAllByRole('button', { name: /all accounts/i });
    // The trigger and the "All accounts" row share a label; the row is the one inside the list.
    const row = chosen.find((element) => element.closest('li') !== null);
    expect(row?.getAttribute('aria-current')).toBe('true');
  });

  it('only claims aria-controls while the panel it names exists', async () => {
    const user = setupUser();
    render(mount());
    const trigger = screen.getByRole('button', { name: /all accounts/i });

    expect(trigger.getAttribute('aria-controls')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(trigger);

    const controls = trigger.getAttribute('aria-controls');
    expect(controls).not.toBeNull();
    expect(document.getElementById(controls as string)).not.toBeNull();
  });

  it('closes on Escape and puts focus back on the trigger', async () => {
    const user = setupUser();
    const trigger = await openPanel();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByText(/available to spend/i)).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });
});
