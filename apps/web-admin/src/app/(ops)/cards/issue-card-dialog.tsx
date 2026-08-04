/**
 * Issuing a card.
 *
 * Virtual cards work the moment they are issued; physical ones are printed and posted and
 * then have to be activated by the customer. The form says which is which at the point of
 * choosing, because the difference is the whole of the customer's next question.
 */

'use client';

import { useState } from 'react';

import { CardFormat, CardTier } from '@reliance/contracts';
import { Alert, Dialog, FormField, Input, Select } from '@reliance/ui';

import { DialogActions } from '@/components/ops';
import { messageFor } from '@/lib/errors';
import { humaniseCode } from '@/lib/format';

import { useCardActions } from './use-card-actions';

const FORMAT_OPTIONS = Object.values(CardFormat).map((value) => ({
  value,
  label: humaniseCode(value),
}));

const TIER_OPTIONS = Object.values(CardTier).map((value) => ({
  value,
  label: humaniseCode(value),
}));

const FORMAT_HINT: Readonly<Record<CardFormat, string>> = {
  [CardFormat.VIRTUAL]: 'Usable straight away, in the app and for online payments.',
  [CardFormat.PHYSICAL]:
    'Printed and posted to the address on file, then activated by the customer.',
};

interface Draft {
  readonly accountId: string;
  readonly format: CardFormat;
  readonly tier: CardTier;
  readonly nickname: string;
}

const EMPTY: Draft = {
  accountId: '',
  format: CardFormat.VIRTUAL,
  tier: CardTier.STANDARD,
  nickname: '',
};

export interface IssueCardDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Issues a card against a customer account. */
/** Everything the desk chooses when ordering a card. */
function IssueFields({
  draft,
  set,
}: {
  readonly draft: Draft;
  readonly set: (patch: Partial<Draft>) => void;
}) {
  return (
    <>
      <FormField label="Customer account" required hint="For example acc_01J8…">
        <Input
          value={draft.accountId}
          onChange={(event) => set({ accountId: event.target.value })}
        />
      </FormField>

      <FormField label="Format" required hint={FORMAT_HINT[draft.format]}>
        <Select
          value={draft.format}
          options={FORMAT_OPTIONS}
          onChange={(event) => set({ format: event.target.value as CardFormat })}
        />
      </FormField>

      <FormField label="Tier" required hint="Sets the card's limits, fees and card art.">
        <Select
          value={draft.tier}
          options={TIER_OPTIONS}
          onChange={(event) => set({ tier: event.target.value as CardTier })}
        />
      </FormField>

      <FormField label="Nickname" hint="Optional. How the card is labelled in the customer's app.">
        <Input value={draft.nickname} onChange={(event) => set({ nickname: event.target.value })} />
      </FormField>
    </>
  );
}

/**
 * The card being ordered, cleared each time the dialog opens.
 *
 * Reset during render rather than in an effect: an effect paints the previous draft for a
 * frame first, and an account id left over from the last card is the kind of stale value
 * someone submits without reading.
 */
function useIssueDraft(open: boolean, onClose: () => void) {
  const { issue } = useCardActions();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(EMPTY);
  }

  const set = (patch: Partial<Draft>): void => setDraft({ ...draft, ...patch });

  const submit = (): void => {
    issue.mutate(
      {
        accountId: draft.accountId.trim(),
        format: draft.format,
        tier: draft.tier,
        ...(draft.nickname.trim() ? { nickname: draft.nickname.trim() } : {}),
      },
      { onSuccess: onClose },
    );
  };

  return { issue, draft, set, submit };
}

export function IssueCardDialog({ open, onClose }: IssueCardDialogProps) {
  const { issue, draft, set, submit } = useIssueDraft(open, onClose);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Issue a card"
      description="Orders a new card against a customer account."
      footer={
        <DialogActions
          confirmLabel="Issue the card"
          onCancel={onClose}
          onConfirm={submit}
          pending={issue.isPending}
          disabled={draft.accountId.trim().length === 0}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {issue.error && <Alert tone="danger">{messageFor(issue.error)}</Alert>}
        <IssueFields draft={draft} set={set} />
      </div>
    </Dialog>
  );
}
