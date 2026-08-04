/**
 * The OTP field's three load-bearing behaviours: paste fills everything, the value stays compact,
 * and backspace walks backwards. Everything else about it is cosmetic.
 */

import { render, screen } from '@testing-library/react';

import { setupUser } from '../test/user';

import { OTP_LENGTH, OTPInput } from './otp-input.js';

const LABEL = 'Six-digit code';

const boxes = () => screen.getAllByRole('textbox');
const code = () =>
  boxes()
    .map((box) => (box as HTMLInputElement).value)
    .join('');

describe('OTPInput', () => {
  it('renders one box per digit, each individually labelled', () => {
    render(<OTPInput label={LABEL} />);

    expect(boxes()).toHaveLength(OTP_LENGTH);
    expect(screen.getByLabelText(`${LABEL}, digit 1 of 6`)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: LABEL })).toBeInTheDocument();
  });

  it('advances as digits are typed and fires onComplete on the last one', async () => {
    const user = setupUser();
    const onComplete = jest.fn();
    render(<OTPInput label={LABEL} onComplete={onComplete} />);

    await user.click(boxes()[0] as HTMLElement);
    await user.keyboard('482913');

    expect(code()).toBe('482913');
    expect(onComplete).toHaveBeenCalledWith('482913');
  });

  it('fills the whole code from a paste into any box', async () => {
    const user = setupUser();
    const onComplete = jest.fn();
    render(<OTPInput label={LABEL} onComplete={onComplete} />);

    await user.click(boxes()[0] as HTMLElement);
    await user.paste('123456');

    expect(code()).toBe('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('strips separators and spaces out of a pasted code', async () => {
    const user = setupUser();
    render(<OTPInput label={LABEL} />);

    await user.click(boxes()[0] as HTMLElement);
    await user.paste('123 456');

    expect(code()).toBe('123456');
  });

  it('ignores anything past the last box', async () => {
    const user = setupUser();
    render(<OTPInput label={LABEL} />);

    await user.click(boxes()[0] as HTMLElement);
    await user.paste('12345678');

    expect(code()).toBe('123456');
  });

  it('refuses non-digits', async () => {
    const user = setupUser();
    render(<OTPInput label={LABEL} />);

    await user.click(boxes()[0] as HTMLElement);
    await user.keyboard('a1b2');

    expect(code()).toBe('12');
  });

  it('deletes backwards on backspace', async () => {
    const user = setupUser();
    render(<OTPInput label={LABEL} />);

    await user.click(boxes()[0] as HTMLElement);
    await user.keyboard('1234');
    await user.keyboard('{Backspace}{Backspace}');

    expect(code()).toBe('12');
  });

  it('never leaves a hole in the middle of the code', async () => {
    const user = setupUser();
    render(<OTPInput label={LABEL} />);

    await user.click(boxes()[0] as HTMLElement);
    await user.keyboard('12');
    // Clicking the last box while only two digits exist must not strand a gap.
    await user.click(boxes()[5] as HTMLElement);
    await user.keyboard('3');

    expect(code()).toBe('123');
  });

  it('moves between boxes with the arrow keys', async () => {
    const user = setupUser();
    render(<OTPInput label={LABEL} defaultValue="123456" />);

    await user.click(boxes()[3] as HTMLElement);
    await user.keyboard('{ArrowLeft}');

    expect(boxes()[2]).toHaveFocus();
  });

  it('reports its value to a controlled parent', async () => {
    const user = setupUser();
    const onValueChange = jest.fn();
    render(<OTPInput label={LABEL} value="" onValueChange={onValueChange} />);

    await user.click(boxes()[0] as HTMLElement);
    await user.keyboard('7');

    expect(onValueChange).toHaveBeenCalledWith('7');
  });
});
