'use client';

/**
 * Disputing a payment.
 *
 * "Have you contacted the merchant?" is asked because the card schemes require it and because it
 * is usually faster — a shop that agrees to refund does so in days, where a chargeback takes
 * weeks. Answering no does not block the dispute; it just means we say what to expect.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { DisputeReason, type CreateDisputeRequest } from '@reliance/contracts';
import { Alert, Button, Checkbox, FormField, Input, Select, Textarea } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { laneRoutes, movementKeys, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { DISPUTE_REASONS } from './support-look';

const DESCRIPTION_MAX = 5000;

/** Raises the dispute and refreshes the list it lands in. */
function useRaiseDispute(cache: ReturnType<typeof useQueryClient>, onRaised: () => void) {
  return useMutation({
    mutationFn: async (body: CreateDisputeRequest) =>
      (await browserApi().support.createDispute(body)).data,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.support.all });
      onRaised();
    },
  });
}

/** Props for {@link DisputeForm}. */
export interface DisputeFormProps {
  /** A transaction to dispute, taken from `?transaction=`. */
  readonly initialTransactionId: string;
}

/**
 * @example <DisputeForm initialTransactionId={id} />
 */
export function DisputeForm({ initialTransactionId }: DisputeFormProps) {
  const router = useRouter();
  const cache = useQueryClient();
  const [transactionId, setTransactionId] = useState(initialTransactionId);
  const [reason, setReason] = useState<DisputeReason>(DisputeReason.UNAUTHORISED);
  const [description, setDescription] = useState('');
  const [contactedMerchant, setContactedMerchant] = useState(false);

  const raise = useRaiseDispute(cache, () => router.push(laneRoutes.support.disputes));

  const ready = Boolean(transactionId.trim() && description.trim());

  const submit = (): void => {
    if (!ready) return;
    raise.mutate({
      transactionId: transactionId.trim(),
      reason,
      description: description.trim(),
      evidenceIds: [],
      contactedMerchant,
    });
  };

  return (
    <Section title="Dispute a payment" description="Tell us what happened and we will investigate.">
      <div className="flex flex-col gap-5">
        <FormAlert error={raise.error} />
        {contactedMerchant ? null : <ContactFirstNotice />}

        <DisputeFields
          transactionId={transactionId}
          reason={reason}
          description={description}
          contactedMerchant={contactedMerchant}
          onTransactionId={setTransactionId}
          onReason={setReason}
          onDescription={setDescription}
          onContactedMerchant={setContactedMerchant}
        />

        <RaiseRow disabled={!ready} pending={raise.isPending} onSubmit={submit} />
      </div>
    </Section>
  );
}

/** Why contacting the merchant first is usually faster. */
function ContactFirstNotice() {
  return (
    <Alert tone="info" title="Try the merchant first if you can">
      A shop that agrees to refund you does it in days. A dispute goes through the card scheme and
      can take several weeks. If you have already tried, or cannot reach them, carry on — that is
      exactly what disputes are for.
    </Alert>
  );
}

/** Props for {@link DisputeFields}. */
interface DisputeFieldsProps {
  readonly transactionId: string;
  readonly reason: DisputeReason;
  readonly description: string;
  readonly contactedMerchant: boolean;
  readonly onTransactionId: (value: string) => void;
  readonly onReason: (value: DisputeReason) => void;
  readonly onDescription: (value: string) => void;
  readonly onContactedMerchant: (value: boolean) => void;
}

/** Which payment, what went wrong, and everything the customer can tell us about it. */
function DisputeFields(props: DisputeFieldsProps) {
  return (
    <>
      <FormField
        label="Which payment"
        hint="Copy the reference from the transaction you want to dispute."
        required
      >
        <Input
          value={props.transactionId}
          autoComplete="off"
          className="font-mono text-sm"
          onChange={(event) => props.onTransactionId(event.target.value)}
        />
      </FormField>

      <FormField label="What went wrong" required>
        <Select
          options={DISPUTE_REASONS}
          value={props.reason}
          onChange={(event) => props.onReason(event.target.value as DisputeReason)}
        />
      </FormField>

      <Textarea
        value={props.description}
        maxLength={DESCRIPTION_MAX}
        showCount
        rows={7}
        aria-label="What happened"
        placeholder="Dates, amounts, who you spoke to and what they said. The more you can tell us, the stronger the case."
        onChange={(event) => props.onDescription(event.target.value)}
      />

      <Checkbox
        checked={props.contactedMerchant}
        onChange={(event) => props.onContactedMerchant(event.target.checked)}
      >
        I have already tried to sort this out with the merchant
      </Checkbox>
    </>
  );
}

/** The one action on the form. */
function RaiseRow({
  disabled,
  pending,
  onSubmit,
}: {
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSubmit: () => void;
}) {
  return (
    <div className="flex justify-end">
      <Button disabled={disabled} loading={pending} onClick={onSubmit}>
        Raise this dispute
      </Button>
    </div>
  );
}
