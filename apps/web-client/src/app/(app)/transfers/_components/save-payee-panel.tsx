'use client';

/**
 * Offering to remember a payee.
 *
 * Offered rather than assumed. A bank that quietly saves every set of account details a customer
 * types builds them a payee list full of one-off transfers, and the nickname field is what makes
 * the list worth having a year later.
 */

import { Checkbox, FormField, Input } from '@reliance/ui';

import type { AmountDraft } from './amount-step';

const NICKNAME_MAX = 120;

/** Props for {@link SavePayeePanel}. */
export interface SavePayeePanelProps {
  readonly value: AmountDraft;
  readonly onChange: (patch: Partial<AmountDraft>) => void;
}

/**
 * @example <SavePayeePanel value={amount} onChange={patchAmount} />
 */
export function SavePayeePanel({ value, onChange }: SavePayeePanelProps) {
  return (
    <div className="border-border bg-surface-sunken flex flex-col gap-3 rounded-md border p-4">
      <Checkbox
        checked={value.saveBeneficiary}
        onChange={(event) => onChange({ saveBeneficiary: event.target.checked })}
      >
        Save these details so you can pay them again
      </Checkbox>

      {value.saveBeneficiary ? (
        <FormField label="Name this payee">
          <Input
            value={value.beneficiaryNickname}
            maxLength={NICKNAME_MAX}
            placeholder="Landlord, Mum, Window cleaner"
            onChange={(event) => onChange({ beneficiaryNickname: event.target.value })}
          />
        </FormField>
      ) : null}
    </div>
  );
}
