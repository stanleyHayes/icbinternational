/**
 * Accessibility smoke tests for every interactive primitive.
 *
 * Two things are checked per control: axe finds no violations, and the keyboard alone can reach
 * and operate it. The second matters more — axe cannot tell you that a switch ignores the space
 * bar, and a customer who cannot use a mouse cannot freeze their card.
 */

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { useState, type ReactElement } from 'react';

import { setupUser } from '../test/user';

import { Button } from './button.js';
import { Checkbox } from './checkbox.js';
import { CurrencyInput } from './currency-input.js';
import { FormField } from './form-field.js';
import { Input } from './input.js';
import { OTPInput } from './otp-input.js';
import { RadioGroup } from './radio-group.js';
import { Radio } from './radio.js';
import { Select } from './select.js';
import { Switch } from './switch.js';
import { Textarea } from './textarea.js';

expect.extend(toHaveNoViolations);

const CURRENCIES = [
  { value: 'GBP', label: 'Pound sterling' },
  { value: 'EUR', label: 'Euro' },
];

/** Every primitive, wrapped in whatever labelling it needs to be legitimate on its own. */
const CASES: readonly (readonly [string, ReactElement])[] = [
  ['Button', <Button key="b">Send money</Button>],
  [
    'Button, loading',
    <Button key="bl" loading>
      Sending
    </Button>,
  ],
  [
    'Button, icon only',
    <Button key="bi" iconOnly aria-label="Close">
      ×
    </Button>,
  ],
  [
    'Input',
    <FormField key="i" label="Reference" hint="Shown on their statement">
      <Input />
    </FormField>,
  ],
  [
    'Input, invalid',
    <FormField key="ii" label="Sort code" error="Must be six digits">
      <Input />
    </FormField>,
  ],
  [
    'Textarea',
    <FormField key="t" label="Message">
      <Textarea maxLength={140} showCount value="" onChange={() => undefined} />
    </FormField>,
  ],
  [
    'Select',
    <FormField key="s" label="Currency">
      <Select placeholder="Choose" options={CURRENCIES} />
    </FormField>,
  ],
  ['Checkbox', <Checkbox key="c">Save this payee</Checkbox>],
  [
    'Checkbox, indeterminate',
    <Checkbox key="ci" indeterminate>
      Select all
    </Checkbox>,
  ],
  [
    'Radio group',
    <RadioGroup key="rg" legend="Transfer speed" name="speed">
      <Radio name="speed" value="instant" description="Seconds">
        Instant
      </Radio>
      <Radio name="speed" value="standard">
        Standard
      </Radio>
    </RadioGroup>,
  ],
  [
    'Switch',
    <Switch key="sw" description="Blocks new payments">
      Card frozen
    </Switch>,
  ],
  [
    'CurrencyInput',
    <FormField key="cu" label="Amount">
      <CurrencyInput currency="GBP" />
    </FormField>,
  ],
  ['OTPInput', <OTPInput key="o" label="Six-digit code" />],
];

describe('primitives are axe-clean', () => {
  it.each(CASES)('%s', async (_name, element) => {
    const { container } = render(element);

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('keyboard operation', () => {
  it('activates a Button with both Enter and Space', async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Send</Button>);

    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('blocks a loading Button so a payment cannot be submitted twice', async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(
      <Button loading onClick={onClick}>
        Send
      </Button>,
    );

    await user.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('toggles a Switch with the space bar and announces it as a switch', async () => {
    const user = setupUser();

    function Frozen() {
      const [on, setOn] = useState(false);
      return (
        <Switch checked={on} onChange={(event) => setOn(event.target.checked)}>
          Card frozen
        </Switch>
      );
    }
    render(<Frozen />);
    const control = screen.getByRole('switch', { name: 'Card frozen' });

    await user.tab();
    expect(control).toHaveFocus();
    await user.keyboard(' ');

    expect(control).toBeChecked();
  });

  it('reaches a Checkbox by its label text', async () => {
    const user = setupUser();
    render(<Checkbox>Save this payee</Checkbox>);

    await user.click(screen.getByLabelText('Save this payee'));

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('moves between radios with the arrow keys', async () => {
    const user = setupUser();
    render(
      <RadioGroup legend="Transfer speed" name="speed">
        <Radio name="speed" value="instant">
          Instant
        </Radio>
        <Radio name="speed" value="standard">
          Standard
        </Radio>
      </RadioGroup>,
    );

    await user.tab();
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
  });
});

describe('field wiring', () => {
  it('associates label, hint and error with the control', () => {
    render(
      <FormField label="Sort code" hint="Six digits" error="Must be six digits">
        <Input />
      </FormField>,
    );
    const field = screen.getByLabelText(/Sort code/);

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Must be six digits');
  });

  it('describes the control by its hint when there is no error', () => {
    render(
      <FormField label="Reference" hint="Shown on their statement">
        <Input />
      </FormField>,
    );

    expect(screen.getByLabelText('Reference')).toHaveAccessibleDescription(
      'Shown on their statement',
    );
  });

  it('announces a validation message the moment it appears', () => {
    render(
      <FormField label="Amount" error="Above your daily limit">
        <Input />
      </FormField>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Above your daily limit');
  });
});
