// TypeScript 7 does not pick `@types/jest` up from the automatic `@types` scan under this
// workspace's pnpm layout, and `tsconfig.json` is shared configuration this app does not own.
// The reference is the narrowest fix and affects type checking only.
/// <reference types="jest" />

/**
 * The shell revalidates on focus. A live region drawn round the whole panel therefore re-reads the
 * breakdown card and the quick actions every time, which buries the one figure that moved.
 */

import { render } from '@testing-library/react';

import { AccountStatus, AccountType, type Account } from '@reliance/contracts';

import { BalancePanel } from './balance-panel';

const BREAKDOWN_HEADING = 'What makes up this balance';
const ACTION_LABEL = 'Send money';

function account(overrides: Partial<Account['balance']> = {}): Account {
  return {
    id: 'acc_11111111111111111111111111',
    userId: 'usr_11111111111111111111111111',
    type: AccountType.CURRENT,
    status: AccountStatus.ACTIVE,
    currency: 'GBP',
    productCode: 'RB-CURRENT',
    productName: 'Reliance Current Account',
    nickname: null,
    number: '12345678',
    sortCode: '040404',
    iban: 'GB29RLNC04040412345678',
    balance: {
      ledger: { amount: '495000', currency: 'GBP' },
      available: { amount: '482350', currency: 'GBP' },
      held: { amount: '12650', currency: 'GBP' },
      overdraftAvailable: { amount: '0', currency: 'GBP' },
      asOf: '2026-08-03T09:00:00.000Z',
      ...overrides,
    },
    holderIds: ['usr_11111111111111111111111111'],
    interestRateBps: null,
    isPrimary: true,
    openedAt: '2024-01-05T09:00:00.000Z',
    closedAt: null,
  } as Account;
}

function liveRegion(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[aria-live="polite"]');
}

describe('BalancePanel', () => {
  it('announces the two figures and nothing else', () => {
    const { container } = render(
      <BalancePanel account={account()} actions={<button type="button">{ACTION_LABEL}</button>} />,
    );

    const text = liveRegion(container)?.textContent ?? '';
    expect(text).toContain('Available balance');
    expect(text).toContain('Current balance');
    expect(text).not.toContain(BREAKDOWN_HEADING);
    expect(text).not.toContain(ACTION_LABEL);
  });

  it('keeps the quick actions and the breakdown out of the live region entirely', () => {
    const { container } = render(
      <BalancePanel account={account()} actions={<button type="button">{ACTION_LABEL}</button>} />,
    );

    const region = liveRegion(container);
    const action = container.querySelector('button');
    expect(action).not.toBeNull();
    expect(region?.contains(action)).toBe(false);
  });

  it('still renders the whole panel outside the region', () => {
    const { container } = render(
      <BalancePanel account={account()} actions={<button type="button">{ACTION_LABEL}</button>} />,
    );

    expect(container.textContent).toContain(BREAKDOWN_HEADING);
    expect(container.textContent).toContain(ACTION_LABEL);
  });

  it('carries the formatted figures, so a change is read as money', () => {
    const { container } = render(<BalancePanel account={account()} />);

    const text = liveRegion(container)?.textContent ?? '';
    expect(text).toContain('4,823.50');
    expect(text).toContain('4,950.00');
  });
});
