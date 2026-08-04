/**
 * The amount field's contract is that its state is integer minor units and never anything else.
 * These tests assert on what it *emits*, because that is what reaches `Money.fromMinor`.
 */

import { render, screen } from '@testing-library/react';
import { useState } from 'react';

import { type CurrencyCode } from '@reliance/money';

import { setupUser } from '../test/user';

import { CurrencyInput } from './currency-input.js';
import { FormField } from './form-field.js';

interface HarnessProps {
  readonly currency?: CurrencyCode;
  readonly allowNegative?: boolean;
}

function Harness({ currency = 'GBP', allowNegative = false }: HarnessProps) {
  const [value, setValue] = useState('');
  return (
    <>
      <FormField label="Amount">
        <CurrencyInput
          currency={currency}
          value={value}
          onValueChange={setValue}
          allowNegative={allowNegative}
        />
      </FormField>
      <output data-testid="emitted">{value}</output>
    </>
  );
}

const emitted = () => screen.getByTestId('emitted').textContent;

describe('CurrencyInput', () => {
  it('fills digits from the right, like a card terminal', async () => {
    const user = setupUser();
    render(<Harness />);
    const field = screen.getByLabelText('Amount');

    await user.type(field, '1');
    expect(field).toHaveValue('0.01');
    await user.type(field, '2');
    expect(field).toHaveValue('0.12');
    await user.type(field, '345');
    expect(field).toHaveValue('123.45');
    expect(emitted()).toBe('12345');
  });

  it('emits integer minor units, never a decimal string', async () => {
    const user = setupUser();
    render(<Harness />);

    await user.type(screen.getByLabelText('Amount'), '125000');

    expect(emitted()).toBe('125000');
    expect(emitted()).not.toContain('.');
  });

  it('ignores a typed decimal separator rather than creating a float', async () => {
    const user = setupUser();
    render(<Harness />);

    await user.type(screen.getByLabelText('Amount'), '12.34');

    expect(emitted()).toBe('1234');
  });

  it('respects a zero-exponent currency', async () => {
    const user = setupUser();
    render(<Harness currency="JPY" />);
    const field = screen.getByLabelText('Amount');

    await user.type(field, '1234');

    expect(field).toHaveValue('1,234');
    expect(emitted()).toBe('1234');
  });

  it('clears to an empty value rather than to zero', async () => {
    const user = setupUser();
    render(<Harness />);
    const field = screen.getByLabelText('Amount');

    await user.type(field, '5');
    await user.clear(field);

    expect(emitted()).toBe('');
  });

  it('accepts a negative amount only when allowed', async () => {
    const user = setupUser();
    const { unmount } = render(<Harness />);

    await user.type(screen.getByLabelText('Amount'), '-50');
    expect(emitted()).toBe('50');
    unmount();

    render(<Harness allowNegative />);
    await user.type(screen.getByLabelText('Amount'), '-50');
    expect(emitted()).toBe('-50');
  });

  it('shows the currency symbol without putting it in the value', () => {
    render(<Harness />);

    expect(screen.getByText('£')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toHaveValue('');
  });

  it('is wired to its label and its error', () => {
    render(
      <FormField label="Amount" error="Above your daily limit">
        <CurrencyInput currency="GBP" />
      </FormField>,
    );
    const field = screen.getByLabelText('Amount');

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Above your daily limit');
  });
});
