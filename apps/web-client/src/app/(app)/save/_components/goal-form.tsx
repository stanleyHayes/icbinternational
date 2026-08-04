'use client';

/**
 * Starting a savings goal.
 *
 * A target date is optional because plenty of goals do not have one, and asking for a date somebody
 * has not thought about produces a made-up one that then makes the goal look permanently behind.
 * Round-ups are offered here rather than buried in settings, because the moment a goal is created
 * is the moment somebody is willing to opt into saving more.
 */

import { useRouter } from 'next/navigation';

import type { Account } from '@reliance/contracts';
import { Button, FormField, Input, Switch } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  AccountSelect,
  AmountField,
  laneRoutes,
  Section,
  useUsableAccounts,
} from '@/components/transfers';

import { useGoalForm } from './use-goal-form';

const NAME_MAX = 120;

const ROUND_UP_DETAIL =
  'Every card payment is rounded up to the nearest pound and the difference goes into this goal.';

/**
 * @example <GoalForm />
 */
/** Everything the customer fills in to start a goal. */
function GoalFields({
  form,
  accounts,
}: {
  readonly form: ReturnType<typeof useGoalForm>;
  readonly accounts: readonly Account[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <FormAlert error={form.create.error} />

      <NameField value={form.draft.name} onChange={(name) => form.patch({ name })} />

      <AccountSelect
        label="Save from"
        accounts={accounts}
        value={form.draft.linkedAccountId}
        onChange={(linkedAccountId) => form.patch({ linkedAccountId })}
      />

      <AmountField
        label="Target"
        currency={form.currency}
        value={form.draft.target}
        onChange={(target) => form.patch({ target })}
      />

      <TargetDateField
        value={form.draft.targetDate}
        onChange={(targetDate) => form.patch({ targetDate })}
      />

      <RoundUpSwitch
        checked={form.draft.roundUps}
        onChange={(roundUps) => form.patch({ roundUps })}
      />

      <div className="flex justify-end">
        <Button disabled={!form.ready} loading={form.create.isPending} onClick={form.submit}>
          Start this goal
        </Button>
      </div>
    </div>
  );
}

export function GoalForm() {
  const router = useRouter();
  const accounts = useUsableAccounts();
  const form = useGoalForm(accounts.data, (goal) => router.push(laneRoutes.save.goal(goal.id)));

  return (
    <Section
      title="Start a goal"
      description="Name it, set a target, and we will track it for you."
    >
      <GoalFields form={form} accounts={accounts.data ?? []} />
    </Section>
  );
}

/** What the customer is saving for, in their words. */
function NameField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <FormField label="What are you saving for?" required>
      <Input
        value={value}
        maxLength={NAME_MAX}
        placeholder="Deposit for a flat, Holiday, Rainy day"
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

/** Optional, because plenty of goals genuinely have no date. */
function TargetDateField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <FormField
      label="Date you want it by"
      hint="Optional. If you set one, we will tell you what to put aside each month."
    >
      <Input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </FormField>
  );
}

/** Opting into round-ups at the moment somebody is most willing to. */
function RoundUpSwitch({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (on: boolean) => void;
}) {
  return (
    <Switch
      checked={checked}
      description={ROUND_UP_DETAIL}
      onChange={(event) => onChange(event.target.checked)}
    >
      Round-ups on
    </Switch>
  );
}
