'use client';

/**
 * Opening a fixed deposit.
 *
 * The rate for the chosen term sits on the option itself, so the decision is made against the
 * number rather than after it. Auto-rollover is off by default: money that quietly re-locks for
 * another year without being asked is money the customer did not choose to lock.
 */

import { useRouter } from 'next/navigation';

import type { Account, DepositRate } from '@reliance/contracts';
import { Button, FormField, Select, Switch } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  AccountSelect,
  AmountField,
  laneRoutes,
  QueryPanel,
  Section,
  useUsableAccounts,
} from '@/components/transfers';

import { percentFromBps, termLabel } from './rate-table';
import { useDepositForm } from './use-deposit-form';

const ROLLOVER_DETAIL =
  'At the end of the term we open a new deposit at whatever rate applies then. Off by default.';

/**
 * @example <DepositForm />
 */
export function DepositForm() {
  const router = useRouter();
  const accounts = useUsableAccounts();
  const form = useDepositForm(accounts.data, (deposit) =>
    router.push(laneRoutes.save.deposit(deposit.id)),
  );

  return (
    <Section title="Open a fixed deposit" description="The rate is fixed for the whole term.">
      <div className="flex flex-col gap-6">
        <FormAlert error={form.create.error} />

        <DepositFields form={form} accounts={accounts.data ?? []} />

        <RolloverSwitch
          checked={form.draft.autoRollover}
          onChange={(autoRollover) => form.patch({ autoRollover })}
        />

        <div className="flex justify-end">
          <Button disabled={!form.ready} loading={form.create.isPending} onClick={form.submit}>
            Open this deposit
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** The term, priced. The rate is on the option so the choice is made against the number. */
function TermPicker({
  rates,
  value,
  onChange,
}: {
  readonly rates: readonly DepositRate[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <FormField label="Term" hint="Longer terms pay more. You can still break it early." required>
      <Select
        value={value}
        placeholder={value ? undefined : 'Choose a term'}
        options={rates.map((rate) => ({
          value: String(rate.termMonths),
          label: `${termLabel(rate.termMonths)} · ${percentFromBps(rate.annualRateBps)} a year`,
        }))}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

/** What happens when the term ends. Off by default, and the label states the outcome. */
function RolloverSwitch({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (on: boolean) => void;
}) {
  return (
    <Switch
      checked={checked}
      description={ROLLOVER_DETAIL}
      onChange={(event) => onChange(event.target.checked)}
    >
      {checked ? 'Roll over automatically' : 'Return the money at the end of the term'}
    </Switch>
  );
}

/** Props for {@link DepositFields}. */
interface DepositFieldsProps {
  readonly form: ReturnType<typeof useDepositForm>;
  readonly accounts: readonly Account[];
}

/** Where the money comes from, how much of it, and for how long. */
function DepositFields({ form, accounts }: DepositFieldsProps) {
  return (
    <>
      <AccountSelect
        label="Take the money from"
        accounts={accounts}
        value={form.draft.sourceAccountId}
        onChange={(sourceAccountId) => form.patch({ sourceAccountId })}
      />

      <AmountField
        label="Amount to lock away"
        currency={form.currency}
        value={form.draft.amount}
        onChange={(amount) => form.patch({ amount })}
        available={form.source?.balance.available.amount}
      />

      <QueryPanel query={form.rates} skeletonRows={1}>
        {(list) => (
          <TermPicker
            rates={list}
            value={form.draft.termMonths}
            onChange={(termMonths) => form.patch({ termMonths })}
          />
        )}
      </QueryPanel>
    </>
  );
}
