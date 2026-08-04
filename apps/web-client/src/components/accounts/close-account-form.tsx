'use client';

/**
 * Closing an account.
 *
 * Closing is irreversible, so the screen does three things before it will let the customer
 * through: it states what happens to the money, it makes them choose where a residual balance
 * goes, and it asks them to type the account name. The typed confirmation is not theatre — it is
 * the difference between closing an account and closing *this* account, on a page reached from a
 * list of four.
 *
 * The bank refuses to close an account that still holds money without a destination, and the
 * error that comes back says so in those words rather than as a code.
 */

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { Account } from '@reliance/contracts';
import { Alert, Button, Card, FormField, Input, Select, Textarea } from '@reliance/ui';

import { FailureAlert } from '@/components/transactions/form-parts';

import { accountName } from './account-tile';
import { isOpen } from './labels';
import { accountsRoute } from './routes';
import { useCloseAccount } from './use-accounts';

const REASON_MAX_LENGTH = 200;
const NO_SWEEP = '';

/** Props for {@link CloseAccountForm}. */
export interface CloseAccountFormProps {
  readonly account: Account;
  /** The customer's other open accounts, as possible destinations for a residual balance. */
  readonly others: readonly Account[];
}

const REASON_ROWS = 3;

/** What the customer has filled in so far. One object, so the form has one state to thread. */
interface Draft {
  readonly sweepTo: string;
  readonly reason: string;
  readonly confirmation: string;
}

const EMPTY_DRAFT: Draft = { sweepTo: NO_SWEEP, reason: '', confirmation: '' };

interface FieldsProps {
  readonly expected: string;
  readonly destinations: readonly { value: string; label: string }[];
  readonly holdsMoney: boolean;
  readonly draft: Draft;
  readonly onChange: (changes: Partial<Draft>) => void;
}

/** Where a residual balance goes. Absent when the account is already empty. */
function SweepField(props: Pick<FieldsProps, 'destinations' | 'draft' | 'onChange'>) {
  return (
    <FormField
      label="Where should the remaining balance go?"
      hint="We move the balance before the account closes. Choose one of your other accounts in the same currency."
    >
      <Select
        placeholder="Choose an account"
        options={props.destinations}
        value={props.draft.sweepTo}
        onChange={(event) => props.onChange({ sweepTo: event.target.value })}
      />
    </FormField>
  );
}

/** Where the money goes, why, and the typed confirmation. */
function Fields(props: FieldsProps) {
  const { expected, holdsMoney, draft, onChange } = props;

  return (
    <Card className="flex flex-col gap-4">
      {holdsMoney ? (
        <SweepField destinations={props.destinations} draft={draft} onChange={onChange} />
      ) : null}

      <FormField
        label="Why are you closing it?"
        hint="Optional, and it genuinely helps us. Nobody will contact you about it."
      >
        <Textarea
          value={draft.reason}
          maxLength={REASON_MAX_LENGTH}
          showCount
          rows={REASON_ROWS}
          onChange={(event) => onChange({ reason: event.target.value })}
        />
      </FormField>

      <FormField
        label={`Type “${expected}” to confirm`}
        hint="This makes sure the right account is closed."
      >
        <Input
          value={draft.confirmation}
          autoComplete="off"
          onChange={(event) => onChange({ confirmation: event.target.value })}
        />
      </FormField>
    </Card>
  );
}

/** The destructive action and the way out of it, in that order but with the safe one last. */
function Actions({
  pending,
  disabled,
  onCancel,
}: {
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="danger" loading={pending} disabled={disabled}>
        Close this account
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Keep it open
      </Button>
    </div>
  );
}

const IRREVERSIBLE =
  'Any standing orders and Direct Debits on this account will stop. Its statements stay available to you for six years, and you can reopen a new account at any time.';

/**
 * @example <CloseAccountForm account={account} others={others} />
 */
/** Accounts a residual balance could be swept into: open, and in the same currency. */
function sweepDestinations(account: Account, others: readonly Account[]) {
  return others
    .filter((candidate) => isOpen(candidate.status) && candidate.currency === account.currency)
    .map((candidate) => ({ value: candidate.id, label: accountName(candidate) }));
}

/** The draft, and the one way to change it. */
function useDraft(): readonly [Draft, (changes: Partial<Draft>) => void] {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  return [draft, (changes) => setDraft((current) => ({ ...current, ...changes }))];
}

export function CloseAccountForm({ account, others }: CloseAccountFormProps) {
  const router = useRouter();
  const close = useCloseAccount(account.id);
  const [draft, change] = useDraft();

  const expected = accountName(account);
  const confirmed = draft.confirmation.trim().toLowerCase() === expected.toLowerCase();
  const holdsMoney = BigInt(account.balance.ledger.amount) !== 0n;
  const destinations = sweepDestinations(account, others);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    close.mutate(
      {
        reason: draft.reason.trim() || 'No longer needed',
        ...(draft.sweepTo ? { sweepToAccountId: draft.sweepTo } : {}),
      },
      { onSuccess: () => router.push(accountsRoute) },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <Alert tone="warning" title="Closing an account cannot be undone">
        {IRREVERSIBLE}
      </Alert>

      <Fields
        expected={expected}
        destinations={destinations}
        holdsMoney={holdsMoney}
        draft={draft}
        onChange={change}
      />

      <FailureAlert error={close.error} />

      <Actions
        pending={close.isPending}
        disabled={!confirmed || (holdsMoney && destinations.length > 0 && !draft.sweepTo)}
        onCancel={() => router.back()}
      />
    </form>
  );
}
