/**
 * The banking layer: the arithmetic that must stay in `bigint`, the masking that must never leak
 * a full number, and an axe pass over each component.
 */

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { type ReactElement } from 'react';

import { AccountCard, maskNumber } from './account-card.js';
import { BalanceCard } from './balance-card.js';
import { CardArt } from './card-art.js';
import { LimitMeter, usedPercent } from './limit-meter.js';
import { moneyDirection, moneyTextClass } from './money-tone.js';
import { ProgressRing, savedPercent } from './progress-ring.js';
import { RateTicker } from './rate-ticker.js';
import { TransactionRow } from './transaction-row.js';

expect.extend(toHaveNoViolations);

const CASES: readonly (readonly [string, ReactElement])[] = [
  [
    'BalanceCard',
    <BalanceCard
      key="balance"
      label="Available balance"
      amount="482350"
      currency="GBP"
      secondary={{ label: 'Current balance', amount: '495000' }}
      delta={{ label: 'this month', amount: '-12400' }}
    />,
  ],
  [
    'BalanceCard, loading',
    <BalanceCard key="bl" label="Available" amount="0" currency="GBP" loading />,
  ],
  [
    'AccountCard',
    <AccountCard
      key="account"
      name="Everyday"
      number="40308012345678"
      balance="482350"
      currency="GBP"
      kind="Current"
    />,
  ],
  [
    'TransactionRow',
    <TransactionRow
      key="row"
      counterparty="Tesco"
      amount="-4250"
      currency="GBP"
      when="Today, 14:02"
      detail="Groceries"
      pending
    />,
  ],
  ['CardArt', <CardArt key="card" holder="J MENSAH" last4="4417" expiry="09/29" tier="premium" />],
  [
    'LimitMeter',
    <LimitMeter
      key="limit"
      label="Daily card spending"
      used="68000"
      limit="100000"
      currency="GBP"
    />,
  ],
  [
    'RateTicker',
    <RateTicker key="rate" base="GBP" quote="EUR" rate="1.1642" trend="up" change="+0.0031" />,
  ],
  [
    'ProgressRing',
    <ProgressRing key="ring" label="Deposit" saved="1660000" target="2000000" currency="GBP" />,
  ],
];

describe('banking components are axe-clean', () => {
  it.each(CASES)('%s', async (_name, element) => {
    const { container } = render(element);

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('moneyDirection', () => {
  it.each([
    [1n, false, 'credit'],
    [-1n, false, 'debit'],
    [0n, false, 'zero'],
    [1n, true, 'pending'],
    [-1n, true, 'pending'],
    [0n, true, 'pending'],
  ])('classifies %p (pending: %p) as %p', (amount, pending, expected) => {
    expect(moneyDirection(amount, pending)).toBe(expected);
  });

  it('never colours a credit red or a debit green', () => {
    expect(moneyTextClass('credit')).toBe('text-credit');
    expect(moneyTextClass('debit')).toBe('text-debit');
    expect(moneyTextClass('pending')).toBe('text-pending');
  });
});

describe('maskNumber', () => {
  it('shows only the last four digits', () => {
    expect(maskNumber('40308012345678')).toBe('•••• 5678');
  });

  it('leaves an already-short value alone', () => {
    expect(maskNumber('5678')).toBe('5678');
  });

  it('renders the mask rather than the number it was given', () => {
    render(<AccountCard name="Everyday" number="40308012345678" balance="0" currency="GBP" />);

    expect(screen.queryByText(/40308012345678/)).not.toBeInTheDocument();
    expect(screen.getByText('•••• 5678')).toBeInTheDocument();
  });
});

describe('usedPercent', () => {
  it.each([
    [0n, 100000n, 0],
    [68000n, 100000n, 68],
    [100000n, 100000n, 100],
    [150000n, 100000n, 100],
    [-500n, 100000n, 0],
    [1n, 0n, 0],
  ])('%p of %p is %p%%', (used, limit, expected) => {
    expect(usedPercent(used, limit)).toBe(expected);
  });

  it('stays exact past the float-safe integer range', () => {
    expect(usedPercent(9007199254740993n, 18014398509481986n)).toBe(50);
  });

  it('announces the money rather than the percentage', () => {
    render(<LimitMeter label="Daily card spending" used="68000" limit="100000" currency="GBP" />);

    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '£680.00 of £1,000.00 used',
    );
  });
});

describe('savedPercent', () => {
  it('does not round an almost-complete goal up to done', () => {
    expect(savedPercent(199999n, 200000n)).toBe(99);
  });

  it('describes the goal in full for a screen reader', () => {
    render(<ProgressRing label="Deposit" saved="1660000" target="2000000" currency="GBP" />);

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Deposit: £16,600.00 saved of £20,000.00, 83% complete',
    );
  });
});

describe('TransactionRow', () => {
  it('states "Pending" in words as well as in gold', () => {
    render(
      <TransactionRow counterparty="Tesco" amount="-4250" currency="GBP" when="Today" pending />,
    );

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('-£42.50')).toHaveAttribute('data-direction', 'pending');
  });

  it('becomes a button only when it is selectable', () => {
    const { rerender } = render(
      <TransactionRow counterparty="Tesco" amount="-4250" currency="GBP" when="Today" />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <TransactionRow
        counterparty="Tesco"
        amount="-4250"
        currency="GBP"
        when="Today"
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});

describe('CardArt', () => {
  it('has no way to render a full card number', () => {
    render(<CardArt holder="J MENSAH" last4="4417" expiry="09/29" />);

    expect(screen.getByText(/4417/)).toBeInTheDocument();
    expect(screen.queryByText(/\d{8,}/)).not.toBeInTheDocument();
  });

  it('says "Frozen" rather than only dimming the card', () => {
    render(<CardArt holder="J MENSAH" last4="4417" expiry="09/29" frozen />);

    expect(screen.getByText('Frozen')).toBeInTheDocument();
  });
});
