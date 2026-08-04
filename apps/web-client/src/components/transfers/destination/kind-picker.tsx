'use client';

/**
 * Choosing where the money is going.
 *
 * Four radios in a fieldset, each with the thing a customer actually wants to know before picking:
 * how fast it arrives and what it costs. A row of unlabelled tabs would look tidier and would make
 * "which of these is the cheap one?" unanswerable without pressing each in turn.
 */

import { Radio, RadioGroup } from '@reliance/ui';

import { TransferKind } from './destination-draft';

interface KindOption {
  readonly kind: TransferKind;
  readonly label: string;
  readonly description: string;
}

const OPTIONS: readonly KindOption[] = [
  {
    kind: TransferKind.OWN,
    label: 'Between my accounts',
    description: 'Moves instantly and free of charge',
  },
  {
    kind: TransferKind.RELIANCE,
    label: 'Someone at Reliance Bank',
    description: 'Instant, free, and they are told straight away',
  },
  {
    kind: TransferKind.DOMESTIC,
    label: 'Another UK bank',
    description: 'Usually within two hours, free of charge',
  },
  {
    kind: TransferKind.INTERNATIONAL,
    label: 'A bank abroad',
    description: 'One to three working days · £7.50 plus the exchange rate',
  },
];

/** Props for {@link KindPicker}. */
export interface KindPickerProps {
  readonly value: TransferKind;
  readonly onChange: (kind: TransferKind) => void;
  readonly disabled?: boolean;
  /** Narrows the choices. The payee form omits "between my accounts", which is not a payee. */
  readonly only?: readonly TransferKind[];
  /** The question the radios answer. */
  readonly legend?: string;
}

/**
 * @example <KindPicker value={draft.kind} onChange={setKind} />
 */
export function KindPicker({ value, onChange, disabled, only, legend }: KindPickerProps) {
  const choices = only ? OPTIONS.filter((option) => only.includes(option.kind)) : OPTIONS;

  return (
    <RadioGroup legend={legend ?? 'Where is the money going?'} name="transfer-kind">
      {choices.map((option) => (
        <Radio
          key={option.kind}
          name="transfer-kind"
          value={option.kind}
          checked={value === option.kind}
          disabled={disabled}
          description={option.description}
          onChange={() => onChange(option.kind)}
          className="border-border hover:bg-surface-sunken rounded-md border p-3"
        >
          {option.label}
        </Radio>
      ))}
    </RadioGroup>
  );
}
