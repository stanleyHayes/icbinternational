/**
 * MoneyText is the component with the strictest contract in the package, so it gets the strictest
 * tests: sign semantics, currency exponents, amounts past `Number.MAX_SAFE_INTEGER`, and the
 * guarantee that a float cannot be rendered even when the type system has been bypassed.
 */

import { render } from '@testing-library/react';
import { type ReactElement } from 'react';

import { InvalidMinorUnitsError } from '../lib/minor-units.js';

import { MoneyText } from './money-text.js';

/** The rendered figure carries `data-amount`, which is the exact minor-unit input. */
function renderMoney(element: ReactElement): HTMLElement {
  const { container } = render(element);
  const node = container.querySelector<HTMLElement>('[data-amount]');
  if (!node) throw new Error('MoneyText rendered no figure');
  return node;
}

describe('MoneyText', () => {
  describe('sign', () => {
    it('colours a positive amount as a credit', () => {
      const node = renderMoney(<MoneyText amount="125000" currency="GBP" />);

      expect(node).toHaveAttribute('data-direction', 'credit');
      expect(node.className).toContain('text-credit');
      expect(node.className).not.toContain('text-debit');
    });

    it('colours a negative amount as a debit', () => {
      const node = renderMoney(<MoneyText amount="-4250" currency="GBP" />);

      expect(node).toHaveAttribute('data-direction', 'debit');
      expect(node.className).toContain('text-debit');
    });

    it('leaves zero neutral rather than treating it as a debit', () => {
      const node = renderMoney(<MoneyText amount="0" currency="GBP" />);

      expect(node).toHaveAttribute('data-direction', 'zero');
      expect(node.className).not.toContain('text-debit');
      expect(node.className).not.toContain('text-credit');
      expect(node.textContent).toBe('£0.00');
    });

    it('marks a pending amount gold whichever way the money is going', () => {
      const credit = renderMoney(<MoneyText amount="500" currency="GBP" pending />);
      expect(credit).toHaveAttribute('data-direction', 'pending');
      expect(credit.className).toContain('text-pending');

      const debit = renderMoney(<MoneyText amount="-500" currency="GBP" pending />);
      expect(debit).toHaveAttribute('data-direction', 'pending');
    });

    it('forces a leading plus on credits when signed', () => {
      expect(renderMoney(<MoneyText amount="2500" currency="USD" signed />).textContent).toBe(
        '+$25.00',
      );
    });

    it('does not sign zero even when signed is set', () => {
      expect(renderMoney(<MoneyText amount="0" currency="USD" signed />).textContent).toBe('$0.00');
    });

    it('keeps the colour but drops it when muted', () => {
      const node = renderMoney(<MoneyText amount="-4250" currency="GBP" muted />);

      expect(node).toHaveAttribute('data-direction', 'debit');
      expect(node.className).not.toContain('text-debit');
    });
  });

  describe('currency', () => {
    it('uses the currency exponent, not a hardcoded two decimal places', () => {
      expect(renderMoney(<MoneyText amount="1234" currency="JPY" />).textContent).toBe('¥1,234');
      // KWD has three minor places. The symbol's spacing is Intl's business, the digits are ours.
      expect(renderMoney(<MoneyText amount="1234567" currency="KWD" />).textContent).toContain(
        '1,234.567',
      );
    });

    it('renders digits only when asked, for a column with its own header', () => {
      expect(
        renderMoney(<MoneyText amount="125000" currency="GBP" display="none" />).textContent,
      ).toBe('1,250.00');
    });

    it('honours the locale', () => {
      const node = renderMoney(<MoneyText amount="-500" currency="EUR" locale="de-DE" />);

      expect(node.textContent).toContain('5,00');
      expect(node.textContent).toContain('€');
    });

    it('records the currency alongside the amount for machine readers', () => {
      const node = renderMoney(<MoneyText amount="1" currency="NGN" />);

      expect(node).toHaveAttribute('data-currency', 'NGN');
      expect(node).toHaveAttribute('data-amount', '1');
    });
  });

  describe('magnitude', () => {
    it('renders an amount far beyond Number.MAX_SAFE_INTEGER without losing a unit', () => {
      // 90,071,992,547,409.93 GBP — one minor unit above 2^53, where a float silently rounds.
      const node = renderMoney(<MoneyText amount="9007199254740993" currency="GBP" />);

      expect(node.textContent).toBe('£90,071,992,547,409.93');
      expect(node).toHaveAttribute('data-amount', '9007199254740993');
    });

    it('renders a sub-unit amount without dropping the leading zero', () => {
      expect(renderMoney(<MoneyText amount="1" currency="GBP" />).textContent).toBe('£0.01');
    });
  });

  describe('float safety', () => {
    it.each(['12.50', '1e3', '0.1', '', 'twelve', '1,250', ' 100'])(
      'refuses to render %p',
      (amount) => {
        expect(() => render(<MoneyText amount={amount} currency="GBP" />)).toThrow(
          InvalidMinorUnitsError,
        );
      },
    );

    it('refuses a number that has bypassed the type system', () => {
      const amount = 12.5 as unknown as string;

      expect(() => render(<MoneyText amount={amount} currency="GBP" />)).toThrow(
        InvalidMinorUnitsError,
      );
    });
  });

  describe('presentation', () => {
    it('applies tabular figures so a live balance does not jitter', () => {
      const node = renderMoney(<MoneyText amount="111111" currency="GBP" />);

      expect(node.className).toContain('rb-tabular');
      expect(node.className).toContain('tabular-nums');
    });

    it('reads a label before the figure without showing it twice', () => {
      const node = renderMoney(
        <MoneyText amount="482350" currency="GBP" srLabel="Available balance" />,
      );

      expect(node.textContent).toBe('Available balance £4,823.50');
      expect(node.querySelector('.sr-only')?.textContent).toBe('Available balance ');
    });

    it('merges a caller class without losing its own', () => {
      const node = renderMoney(<MoneyText amount="1" currency="GBP" className="block" />);

      expect(node.className).toContain('block');
      expect(node.className).toContain('rb-tabular');
    });
  });
});
