'use client';

/**
 * Airtime and data.
 *
 * The number is the thing people get wrong, so it is asked for on its own line and echoed back in
 * the confirmation. Airtime and data are the same request with a different bundle, which is why
 * they are one form rather than two screens.
 */

import { Alert, Button, FormField, Input, Radio, RadioGroup, Select } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { AccountSelect, AmountField, Section, useUsableAccounts } from '@/components/transfers';
import { maskPhone } from '@/lib/format';

import { useTopUp, type Bundle } from './use-top-up';

const PROVIDERS = ['EE', 'O2', 'Three', 'Vodafone', 'Giffgaff', 'Lebara'] as const;

const PROVIDER_OPTIONS = PROVIDERS.map((name) => ({ value: name, label: name }));

/**
 * @example <TopUpForm />
 */
export function TopUpForm() {
  const accounts = useUsableAccounts();
  const form = useTopUp(accounts.data, PROVIDERS[0]);

  return (
    <Section title="Top up a phone" description="Airtime or a data bundle, on any UK network.">
      <div className="flex flex-col gap-5">
        <FormAlert error={form.topUp.error} />
        {form.topUp.isSuccess ? <ToppedUp phone={form.draft.phone} /> : null}

        <AccountSelect
          label="Pay from"
          accounts={accounts.data ?? []}
          value={form.draft.sourceAccountId}
          onChange={(sourceAccountId) => form.patch({ sourceAccountId })}
        />

        <TopUpFields
          provider={form.draft.provider}
          phone={form.draft.phone}
          bundle={form.draft.bundle}
          onProvider={(provider) => form.patch({ provider })}
          onPhone={(phone) => form.patch({ phone })}
          onBundle={(bundle) => form.patch({ bundle })}
        />

        <AmountField
          label="Amount"
          currency={form.source?.currency ?? 'GBP'}
          value={form.draft.amount}
          onChange={(amount) => form.patch({ amount })}
        />

        <SubmitRow disabled={!form.ready} pending={form.topUp.isPending} onSubmit={form.submit} />
      </div>
    </Section>
  );
}

/** The confirmation, with the number echoed back partly masked. */
function ToppedUp({ phone }: { readonly phone: string }) {
  return (
    <div role="status" aria-live="polite">
      <Alert tone="success" title="Topped up">
        The credit is on its way to {maskPhone(phone)}. It usually arrives within a minute.
      </Alert>
    </div>
  );
}

/** Props for {@link TopUpFields}. */
interface TopUpFieldsProps {
  readonly provider: string;
  readonly phone: string;
  readonly bundle: Bundle;
  readonly onProvider: (value: string) => void;
  readonly onPhone: (value: string) => void;
  readonly onBundle: (value: Bundle) => void;
}

/** Network, number and what is being bought. */
function TopUpFields(props: TopUpFieldsProps) {
  return (
    <>
      <FormField label="Network" required>
        <Select
          options={PROVIDER_OPTIONS}
          value={props.provider}
          onChange={(event) => props.onProvider(event.target.value)}
        />
      </FormField>

      <FormField label="Mobile number" hint="The number you are topping up." required>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={props.phone}
          onChange={(event) => props.onPhone(event.target.value)}
        />
      </FormField>

      <RadioGroup legend="What are you buying?" name="bundle" orientation="horizontal">
        <Radio
          name="bundle"
          value="AIRTIME"
          checked={props.bundle === 'AIRTIME'}
          onChange={() => props.onBundle('AIRTIME')}
        >
          Airtime
        </Radio>
        <Radio
          name="bundle"
          value="DATA"
          checked={props.bundle === 'DATA'}
          onChange={() => props.onBundle('DATA')}
        >
          Data
        </Radio>
      </RadioGroup>
    </>
  );
}

/** The one action on the screen. */
function SubmitRow({
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
        Top up this number
      </Button>
    </div>
  );
}
