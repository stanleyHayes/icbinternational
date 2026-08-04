'use client';

/**
 * The one-time-code input: six boxes that behave as one field.
 *
 * A split field is measurably easier to transcribe from an SMS than a single box, but it must not
 * be harder to *paste* into — users paste codes, and a field that only accepts keystrokes turns a
 * two-second task into six. Pasting into any box fills the whole code.
 *
 * The boxes are individually labelled ("digit 3 of 6") so a screen-reader user always knows where
 * they are; the group carries the real question.
 */

import { FOCUS_RING, TABULAR, TRANSITION_STATE } from '../foundation/styles.js';
import { cn } from '../lib/cn.js';

import { useFieldControl } from './field-context.js';
import { useOtpController } from './otp-controller.js';

/** Six digits is the scheme used by every OTP the bank issues. */
export const OTP_LENGTH = 6;

const BOX_CLASSES =
  'size-12 rounded-md border border-border bg-surface text-center text-2xl font-medium text-fg ' +
  'aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-60';

export interface OTPInputProps {
  /** Number of boxes. */
  readonly length?: number;
  /** Controlled value: the digits entered so far. Never longer than `length`, never with gaps. */
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  /** Fired the moment the last box fills — wire verification here, not to a submit button. */
  readonly onComplete?: (value: string) => void;
  /** Accessible name for the group, e.g. "Six-digit code from your authenticator app". */
  readonly label: string;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly className?: string;
}

/**
 * @example <OTPInput label="Six-digit code from your authenticator app" onComplete={verify} />
 */
export function OTPInput(props: OTPInputProps) {
  const { length = OTP_LENGTH, label, disabled, autoFocus, className } = props;
  const field = useFieldControl();
  const otp = useOtpController({ ...props, length });

  return (
    <div
      role="group"
      aria-label={label}
      // `aria-invalid` is deliberately NOT set here: the group role does not support it.
      // Each digit input carries it instead, which is where a screen reader expects the
      // validity of a value to live.
      aria-describedby={field['aria-describedby']}
      className={cn('flex gap-2', className)}
    >
      {otp.cells.map((cell, index) => (
        <input
          key={cell.id}
          ref={otp.registerBox(index)}
          id={index === 0 ? field.id : undefined}
          type="text"
          inputMode="numeric"
          // One box owns the autofill hint. Six competing `one-time-code` fields make the OS
          // offer the code six times and fill only whichever box happens to be focused.
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          // Auto-focus is off by default and opt-in per usage. The one screen that opts in
          // is the OTP challenge, where the code field is the entire purpose of the page —
          // landing anywhere else costs a screen-reader user a full re-read to find it.
          // eslint-disable-next-line jsx-a11y/no-autofocus -- opt-in, single-purpose screen
          autoFocus={autoFocus === true && index === 0}
          maxLength={1}
          disabled={disabled ?? field.disabled}
          aria-label={`${label}, digit ${index + 1} of ${length}`}
          aria-invalid={field['aria-invalid']}
          value={otp.value[index] ?? ''}
          onChange={(event) => otp.onDigit(index, event.target.value)}
          onKeyDown={(event) => otp.onKeyDown(index, event)}
          onPaste={(event) => otp.onPaste(index, event)}
          onFocus={() => otp.onFocus(index)}
          className={cn(BOX_CLASSES, TABULAR, FOCUS_RING, TRANSITION_STATE)}
        />
      ))}
    </div>
  );
}
