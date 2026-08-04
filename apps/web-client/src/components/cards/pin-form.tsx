'use client';

/**
 * Choosing a card PIN.
 *
 * Entered twice, because a mistyped PIN is discovered at a cash machine in another country. The
 * field is `inputMode="numeric"` and `autoComplete="off"`: a PIN is not a one-time code and must
 * never be offered up by a password manager or an SMS autofill.
 *
 * The obvious sequences are refused here rather than at the terminal, with the reason said plainly.
 */

import { useState } from 'react';

import { Button, FormField, Input } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { Section } from '@/components/transfers';

import type { useCardMutations } from './use-card-mutations';

const PIN_LENGTH = 4;
const NON_DIGIT = /\D/g;

/** PINs a thief guesses first. */
const OBVIOUS: ReadonlySet<string> = new Set(['0000', '1111', '1234', '2222', '4321', '9999']);

/** Why this PIN cannot be used, or null. */
function pinProblem(pin: string, confirmation: string): string | null {
  if (pin.length !== PIN_LENGTH) return `A PIN is ${PIN_LENGTH} digits.`;
  if (OBVIOUS.has(pin))
    return 'Choose a less predictable PIN — this is one of the first anybody tries.';
  if (confirmation !== pin) return 'The two PINs do not match.';
  return null;
}

/** Props for {@link PinForm}. */
export interface PinFormProps {
  readonly pinSet: boolean;
  readonly mutation: ReturnType<typeof useCardMutations>['setPin'];
}

/**
 * @example <PinForm pinSet={card.pinSet} mutation={setPin} />
 */
export function PinForm({ pinSet, mutation }: PinFormProps) {
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showProblem, setShowProblem] = useState(false);

  const problem = pinProblem(pin, confirmation);

  const save = (): void => {
    setShowProblem(true);
    if (problem) return;
    mutation.mutate(pin, {
      onSuccess: () => {
        setPin('');
        setConfirmation('');
        setShowProblem(false);
      },
    });
  };

  return (
    <Section
      title={pinSet ? 'Change your PIN' : 'Choose a PIN'}
      description="You will use this at cash machines and at chip-and-PIN terminals."
    >
      <div className="flex flex-col gap-4">
        <FormAlert error={mutation.error} />

        <PinFields
          pin={pin}
          confirmation={confirmation}
          onPin={setPin}
          onConfirmation={setConfirmation}
          problem={showProblem ? problem : null}
        />

        <div className="flex justify-end">
          <Button loading={mutation.isPending} onClick={save}>
            Save this PIN
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Props for {@link PinFields}. */
interface PinFieldsProps {
  readonly pin: string;
  readonly confirmation: string;
  readonly onPin: (value: string) => void;
  readonly onConfirmation: (value: string) => void;
  readonly problem: string | null;
}

/** The PIN, and the PIN again. Both masked, neither offered to a password manager. */
function PinFields({ pin, confirmation, onPin, onConfirmation, problem }: PinFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="New PIN" required>
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_LENGTH}
          value={pin}
          onChange={(event) => onPin(event.target.value.replaceAll(NON_DIGIT, ''))}
        />
      </FormField>

      <FormField label="Enter it again" error={problem ?? undefined} required>
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_LENGTH}
          value={confirmation}
          onChange={(event) => onConfirmation(event.target.value.replaceAll(NON_DIGIT, ''))}
        />
      </FormField>
    </div>
  );
}
