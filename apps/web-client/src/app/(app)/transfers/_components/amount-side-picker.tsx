'use client';

/**
 * Which side of a cross-currency payment is the exact one.
 *
 * "Send £500" and "make €580 arrive" are different instructions, and a bank that assumes one of
 * them is a bank that under-pays an invoice by the value of its own fee. Asked once, plainly, and
 * only when the payment actually converts.
 */

import { Radio, RadioGroup } from '@reliance/ui';

/** Props for {@link AmountSidePicker}. */
export interface AmountSidePickerProps {
  /** True when the customer has fixed the amount that arrives. */
  readonly receiveSide: boolean;
  readonly onChange: (receiveSide: boolean) => void;
}

/**
 * @example <AmountSidePicker receiveSide={value} onChange={setValue} />
 */
export function AmountSidePicker({ receiveSide, onChange }: AmountSidePickerProps) {
  return (
    <RadioGroup legend="Which amount should be exact?" name="amount-side">
      <Radio
        name="amount-side"
        value="send"
        checked={!receiveSide}
        description="We convert what is left after our fee"
        onChange={() => onChange(false)}
      >
        Take exactly this from my account
      </Radio>
      <Radio
        name="amount-side"
        value="receive"
        checked={receiveSide}
        description="The fee and the conversion are added on top"
        onChange={() => onChange(true)}
      >
        Make exactly this arrive
      </Radio>
    </RadioGroup>
  );
}
