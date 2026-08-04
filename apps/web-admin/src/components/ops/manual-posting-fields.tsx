/**
 * The fields of a manual posting.
 *
 * Every label is a real label, not a placeholder: an operator filling this in has the
 * account number on a call and needs to see which box it goes in while the box already
 * has something in it. The direction field spells out what a debit and a credit do to a
 * customer's balance, because getting that backwards is the classic sign error and the
 * one this form exists to prevent.
 */

'use client';

import { PostingDirection } from '@reliance/contracts';
import { CURRENCY_CODES, type CurrencyCode } from '@reliance/money';
import { Alert, CurrencyInput, FormField, Input, Select, Textarea } from '@reliance/ui';

import { humaniseCode } from '@/lib/format';

import type { PostingDraft } from './manual-posting-form';

const DIRECTION_OPTIONS = Object.values(PostingDirection).map((value) => ({
  value,
  label: humaniseCode(value),
}));

const CURRENCY_OPTIONS = CURRENCY_CODES.map((value) => ({ value, label: value }));

const DIRECTION_HINT = "A credit increases the customer's balance; a debit reduces it.";

export interface PostingFieldsProps {
  readonly draft: PostingDraft;
  readonly onChange: (draft: PostingDraft) => void;
  readonly errors: Readonly<Record<string, string>>;
  /** Errors stay hidden until the operator has tried to submit at least once. */
  readonly showErrors: boolean;
  readonly disabled?: boolean;
}

interface SectionProps extends PostingFieldsProps {
  readonly set: (patch: Partial<PostingDraft>) => void;
  readonly errorFor: (field: string) => string | false;
}

function AccountAndDirection({ draft, disabled, set, errorFor }: SectionProps) {
  return (
    <>
      <FormField
        label="Customer account"
        required
        hint="The account the value moves on, e.g. acc_01J8…"
        error={errorFor('accountId')}
      >
        <Input
          value={draft.accountId}
          disabled={disabled}
          onChange={(event) => set({ accountId: event.target.value })}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Direction" required hint={DIRECTION_HINT}>
          <Select
            value={draft.direction}
            disabled={disabled}
            options={DIRECTION_OPTIONS}
            onChange={(event) => set({ direction: event.target.value as PostingDirection })}
          />
        </FormField>
        <FormField label="Currency" required>
          <Select
            value={draft.currency}
            disabled={disabled}
            options={CURRENCY_OPTIONS}
            onChange={(event) => set({ currency: event.target.value as CurrencyCode })}
          />
        </FormField>
      </div>
    </>
  );
}

function AmountAndContra({ draft, disabled, set, errorFor }: SectionProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Amount" required error={errorFor('amount')}>
        <CurrencyInput
          currency={draft.currency}
          value={draft.amount}
          disabled={disabled}
          onValueChange={(minorUnits) => set({ amount: minorUnits })}
        />
      </FormField>
      <FormField
        label="Contra ledger account"
        required
        hint="Four-digit general-ledger account for the opposing leg."
        error={errorFor('contraLedgerCode')}
      >
        <Input
          value={draft.contraLedgerCode}
          disabled={disabled}
          inputMode="numeric"
          onChange={(event) => set({ contraLedgerCode: event.target.value })}
        />
      </FormField>
    </div>
  );
}

function NarrativeAndJustification({ draft, disabled, set, errorFor }: SectionProps) {
  return (
    <>
      <FormField
        label="Narrative"
        required
        hint="What the customer sees on their statement."
        error={errorFor('narrative')}
      >
        <Input
          value={draft.narrative}
          disabled={disabled}
          onChange={(event) => set({ narrative: event.target.value })}
        />
      </FormField>
      <FormField
        label="Justification"
        required
        hint="Why this posting is being made. Read back by anyone reviewing the decision later."
        error={errorFor('justification')}
      >
        <Textarea
          rows={3}
          value={draft.justification}
          disabled={disabled}
          onChange={(event) => set({ justification: event.target.value })}
        />
      </FormField>
    </>
  );
}

/** Every field of a manual posting, with the dual-control statement above them. */
export function PostingFields(props: PostingFieldsProps) {
  const sections: SectionProps = {
    ...props,
    set: (patch) => props.onChange({ ...props.draft, ...patch }),
    errorFor: (field) => props.showErrors && (props.errors[field] ?? false),
  };

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" title="This needs a second approver">
        The posting is written only once a different operator approves it. Nothing moves when you
        submit this form.
      </Alert>
      <AccountAndDirection {...sections} />
      <AmountAndContra {...sections} />
      <NarrativeAndJustification {...sections} />
    </div>
  );
}
