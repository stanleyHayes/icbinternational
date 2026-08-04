'use client';

/**
 * Saving a payee.
 *
 * The same destination editor the send-money flow uses, so the fields, the validation and the
 * confirmation-of-payee check behave identically in both places. A second implementation here
 * would be a second set of rules about what a valid sort code is.
 *
 * The name check is not a gate. A close match is a warning the customer reads and decides about;
 * blocking on it would teach people to work around the one control that stops payment scams.
 */

import { useRouter } from 'next/navigation';

import type { CurrencyCode } from '@reliance/money';
import { Button, FormField, Input, Select } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  KindPicker,
  laneRoutes,
  NameCheckNotice,
  Section,
  TransferKind,
} from '@/components/transfers';

import { PayeeDestinationFields } from './payee-destination-fields';
import { usePayeeDraft } from './use-payee-draft';

const CURRENCIES: readonly CurrencyCode[] = ['GBP', 'EUR', 'USD'];
const NICKNAME_MAX = 120;

/** A payee is saved against a rail; your own account is not a payee at all. */
const PAYEE_KINDS: readonly TransferKind[] = [
  TransferKind.RELIANCE,
  TransferKind.DOMESTIC,
  TransferKind.INTERNATIONAL,
];

/** Props for {@link LabelFields}. */
interface LabelFieldsProps {
  readonly nickname: string;
  readonly onNickname: (value: string) => void;
  readonly currency: CurrencyCode;
  readonly onCurrency: (value: CurrencyCode) => void;
  readonly nicknameError: boolean;
}

/** What the customer calls this payee, and the currency they pay them in. */
function LabelFields(props: LabelFieldsProps) {
  const { nickname, onNickname, currency, onCurrency, nicknameError } = props;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        label="What do you want to call them?"
        hint="Only you see this. It is what the payee is called in your list."
        error={nicknameError ? 'Give this payee a name.' : undefined}
        required
      >
        <Input
          value={nickname}
          maxLength={NICKNAME_MAX}
          placeholder="Landlord, Mum, Window cleaner"
          onChange={(event) => onNickname(event.target.value)}
        />
      </FormField>

      <FormField label="Currency you will pay them in" required>
        <Select
          options={CURRENCIES.map((code) => ({ value: code, label: code }))}
          value={currency}
          onChange={(event) => onCurrency(event.target.value as CurrencyCode)}
        />
      </FormField>
    </div>
  );
}

/**
 * @example <AddPayeeForm />
 */
export function AddPayeeForm() {
  const router = useRouter();
  const form = usePayeeDraft((payee) => router.push(laneRoutes.payees.detail(payee.id)));

  return (
    <Section
      title="Add a payee"
      description="We check the name with their bank before you save it."
    >
      <div className="flex flex-col gap-6">
        <FormAlert error={form.create.error} />

        <KindPicker
          value={form.draft.kind}
          onChange={(kind) => form.patch({ kind })}
          only={PAYEE_KINDS}
          legend="Who are you saving?"
        />

        <PayeeDestinationFields
          draft={form.draft}
          onChange={form.patch}
          errors={form.errors}
          onDetailsBlur={form.checkName}
        />

        <NameCheckNotice result={form.nameCheck.data} enteredName={form.draft.accountName} />

        <LabelFields
          nickname={form.nickname}
          onNickname={form.setNickname}
          currency={form.currency}
          onCurrency={form.setCurrency}
          nicknameError={form.nicknameError}
        />

        <div className="flex justify-end">
          <Button onClick={form.save} loading={form.create.isPending}>
            Save this payee
          </Button>
        </div>
      </div>
    </Section>
  );
}
