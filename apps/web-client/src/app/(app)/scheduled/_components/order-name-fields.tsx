'use client';

/**
 * The two free-text fields a standing order carries.
 *
 * They look alike and mean opposite things: the name is private and exists so the customer can
 * find the order again, while the reference is public and appears on every payment the recipient
 * sees. Both hints say which is which, because the mistake — putting an account number in the
 * private one, or a nickname in the public one — is common and awkward.
 */

import { FormField, Input } from '@reliance/ui';

import type { OrderDraft } from './use-order-form';

const NAME_MAX = 120;
const REFERENCE_MAX = 140;

/** Which of the two fields to render. */
type NameField = 'name' | 'reference';

const COPY: Readonly<
  Record<NameField, { label: string; hint: string; placeholder: string; max: number }>
> = {
  name: {
    label: 'What is this for?',
    hint: 'Only you see this. It is how the standing order is named in your list.',
    placeholder: 'Rent, Gym, Money to Ama',
    max: NAME_MAX,
  },
  reference: {
    label: 'Reference',
    hint: 'What the person receiving the money sees on each payment.',
    placeholder: 'Flat 4B rent',
    max: REFERENCE_MAX,
  },
};

/** Props for {@link OrderNameFields}. */
export interface OrderNameFieldsProps {
  readonly draft: OrderDraft;
  readonly onChange: (patch: Partial<OrderDraft>) => void;
  readonly field: NameField;
}

/**
 * @example <OrderNameFields draft={draft} onChange={patch} field="reference" />
 */
export function OrderNameFields({ draft, onChange, field }: OrderNameFieldsProps) {
  const copy = COPY[field];

  return (
    <FormField label={copy.label} hint={copy.hint} required={field === 'name'}>
      <Input
        value={draft[field]}
        maxLength={copy.max}
        placeholder={copy.placeholder}
        onChange={(event) => onChange({ [field]: event.target.value })}
      />
    </FormField>
  );
}
