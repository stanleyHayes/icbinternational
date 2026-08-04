'use client';

/**
 * Choosing which second factor to use.
 *
 * Rendered only when there is a genuine choice. A radio group with one option is not a choice, it
 * is a control that looks operable and is not.
 */

import { MfaMethod } from '@reliance/contracts';
import { Radio, RadioGroup } from '@reliance/ui';

const GROUP_NAME = 'second-factor';

const LABELS: Readonly<Record<MfaMethod, string>> = {
  [MfaMethod.TOTP]: 'The code in my authenticator app',
  [MfaMethod.SMS]: 'A code sent by text message',
  [MfaMethod.PASSKEY]: 'My passkey',
  [MfaMethod.RECOVERY_CODE]: 'One of my recovery codes',
};

/** Props for {@link MethodPicker}. */
export interface MethodPickerProps {
  readonly methods: readonly MfaMethod[];
  readonly value: MfaMethod;
  readonly onChange: (method: MfaMethod) => void;
}

/** A radio group over the factors this account has enrolled. */
export function MethodPicker({ methods, value, onChange }: MethodPickerProps) {
  if (methods.length <= 1) return null;

  return (
    <RadioGroup legend="How would you like to confirm?" name={GROUP_NAME}>
      {methods.map((method) => (
        <Radio
          key={method}
          name={GROUP_NAME}
          value={method}
          checked={value === method}
          onChange={() => onChange(method)}
        >
          {LABELS[method]}
        </Radio>
      ))}
    </RadioGroup>
  );
}
