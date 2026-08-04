'use client';

/**
 * Activating a card that has arrived in the post.
 *
 * The last four digits are asked for because they prove the customer is holding the card that was
 * sent, rather than the one that was intercepted. The PIN is chosen at the same time so there is
 * one step rather than two.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert, Button, FormField, Input } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { movementKeys, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

const LAST4_LENGTH = 4;
const PIN_LENGTH = 4;
const NON_DIGIT = /\D/g;

/** Props for {@link ActivateForm}. */
export interface ActivateFormProps {
  readonly cardId: string;
}

/**
 * @example <ActivateForm cardId={card.id} />
 */
export function ActivateForm({ cardId }: ActivateFormProps) {
  const cache = useQueryClient();
  const [last4, setLast4] = useState('');
  const [pin, setPin] = useState('');

  const activate = useMutation({
    mutationFn: async () => (await browserApi().cards.activate(cardId, { last4, pin })).data,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.cards.all });
    },
  });

  const ready = last4.length === LAST4_LENGTH && pin.length === PIN_LENGTH;

  return (
    <Section
      title="Activate this card"
      description="Take the card out of the envelope and enter the last four digits printed on it."
    >
      <div className="flex flex-col gap-4">
        <FormAlert error={activate.error} />

        {activate.isSuccess ? (
          <Alert tone="success" title="Your card is ready to use">
            You can use it straight away online and in shops. Contactless works after your first
            chip-and-PIN payment.
          </Alert>
        ) : null}

        <ActivationFields last4={last4} pin={pin} onLast4={setLast4} onPin={setPin} />

        <div className="flex justify-end">
          <Button disabled={!ready} loading={activate.isPending} onClick={() => activate.mutate()}>
            Activate my card
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Props for {@link ActivationFields}. */
interface ActivationFieldsProps {
  readonly last4: string;
  readonly pin: string;
  readonly onLast4: (value: string) => void;
  readonly onPin: (value: string) => void;
}

/** Proof the customer holds the card, and the PIN they want on it. */
function ActivationFields({ last4, pin, onLast4, onPin }: ActivationFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Last four digits on the card" required>
        <Input
          inputMode="numeric"
          autoComplete="off"
          maxLength={LAST4_LENGTH}
          value={last4}
          onChange={(event) => onLast4(event.target.value.replaceAll(NON_DIGIT, ''))}
        />
      </FormField>

      <FormField
        label="Choose a PIN"
        hint="Four digits you will remember at a cash machine."
        required
      >
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_LENGTH}
          value={pin}
          onChange={(event) => onPin(event.target.value.replaceAll(NON_DIGIT, ''))}
        />
      </FormField>
    </div>
  );
}
