/**
 * Placing a hold.
 *
 * The dialog states the consequence in the words the customer would use: the money is
 * still on their statement and they cannot spend it. Operators place holds under pressure
 * — a court order, a fraud call — and the failure mode is a hold placed on the wrong
 * account, so the account and the amount are the two things the form makes hardest to get
 * wrong and easiest to check before submitting.
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { HoldReason } from '@reliance/contracts';
import { CURRENCY_CODES, type CurrencyCode } from '@reliance/money';
import { Alert, CurrencyInput, Dialog, FormField, Input, Select } from '@reliance/ui';

import { DEFAULT_CURRENCY, DialogActions, opsKeys } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';
import { messageFor } from '@/lib/errors';
import { humaniseCode } from '@/lib/format';

const REASON_OPTIONS = Object.values(HoldReason).map((value) => ({
  value,
  label: humaniseCode(value),
}));

const CURRENCY_OPTIONS = CURRENCY_CODES.map((value) => ({ value, label: value }));

const CONSEQUENCE =
  "The amount stays on the customer's statement and their ledger balance does not change. " +
  'Their available balance drops immediately, and any payment that needs the money will be ' +
  'refused until the hold is captured or released.';

interface HoldDraft {
  readonly accountId: string;
  readonly amount: string;
  readonly currency: CurrencyCode;
  readonly reason: HoldReason;
  readonly description: string;
  readonly expiresAt: string;
}

const EMPTY: HoldDraft = {
  accountId: '',
  amount: '0',
  currency: DEFAULT_CURRENCY,
  reason: HoldReason.COMPLIANCE_REVIEW,
  description: '',
  expiresAt: '',
};

/** End of the chosen calendar day, in the UTC the platform records against. */
const DAY_END = 'T23:59:59Z';

interface FieldsProps {
  readonly draft: HoldDraft;
  readonly set: (patch: Partial<HoldDraft>) => void;
}

function AmountFields({ draft, set }: FieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Amount to hold" required>
        <CurrencyInput
          currency={draft.currency}
          value={draft.amount}
          onValueChange={(minorUnits) => set({ amount: minorUnits })}
        />
      </FormField>
      <FormField label="Currency" required>
        <Select
          value={draft.currency}
          options={CURRENCY_OPTIONS}
          onChange={(event) => set({ currency: event.target.value as CurrencyCode })}
        />
      </FormField>
    </div>
  );
}

function HoldFields({ draft, set }: FieldsProps) {
  return (
    <>
      <FormField label="Customer account" required hint="For example acc_01J8…">
        <Input
          value={draft.accountId}
          onChange={(event) => set({ accountId: event.target.value })}
        />
      </FormField>

      <AmountFields draft={draft} set={set} />

      <FormField label="Reason" required hint="Chosen from the reasons the ledger records.">
        <Select
          value={draft.reason}
          options={REASON_OPTIONS}
          onChange={(event) => set({ reason: event.target.value as HoldReason })}
        />
      </FormField>

      <FormField
        label="Description"
        required
        hint="What this hold is for. Appears on the register and in the audit trail."
      >
        <Input
          value={draft.description}
          onChange={(event) => set({ description: event.target.value })}
        />
      </FormField>

      <FormField
        label="Lapses on"
        hint="Leave empty for a hold with no automatic expiry, such as a court order."
      >
        <Input
          type="date"
          value={draft.expiresAt}
          onChange={(event) => set({ expiresAt: event.target.value })}
        />
      </FormField>
    </>
  );
}

export interface PlaceHoldDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Reserves value on a customer account. */
/**
 * The hold being placed, cleared each time the dialog opens.
 *
 * Reset during render rather than in an effect: an effect paints the previous draft first,
 * and an account id carried over from the last hold is exactly the kind of stale value
 * someone confirms without re-reading.
 *
 * An expiry names a day, so it is widened to the end of that day — a hold that lapsed at
 * midnight on the morning it was set would release the funds the same day it reserved them.
 */
function useHoldDraft(open: boolean, onClose: () => void) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<HoldDraft>(EMPTY);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(EMPTY);
  }

  const place = useMutation({
    mutationFn: async () =>
      client.admin.placeHold({
        accountId: draft.accountId.trim(),
        amount: { amount: draft.amount, currency: draft.currency },
        reason: draft.reason,
        description: draft.description.trim(),
        ...(draft.expiresAt ? { expiresAt: `${draft.expiresAt}${DAY_END}` } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsKeys.all('holds') });
      onClose();
    },
  });

  return {
    draft,
    set: (patch: Partial<HoldDraft>): void => setDraft({ ...draft, ...patch }),
    place,
    ready: draft.accountId.trim().length > 0 && draft.description.trim().length > 0,
  };
}

export function PlaceHoldDialog({ open, onClose }: PlaceHoldDialogProps) {
  const { draft, set, place, ready } = useHoldDraft(open, onClose);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Place a hold"
      description="Reserve value on a customer account without posting to the ledger."
      footer={
        <DialogActions
          confirmLabel="Place the hold"
          onCancel={onClose}
          onConfirm={() => place.mutate()}
          pending={place.isPending}
          disabled={!ready}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {place.error && <Alert tone="danger">{messageFor(place.error)}</Alert>}
        <Alert tone="warning" title="What this does to the customer">
          {CONSEQUENCE}
        </Alert>
        <HoldFields draft={draft} set={set} />
      </div>
    </Dialog>
  );
}
