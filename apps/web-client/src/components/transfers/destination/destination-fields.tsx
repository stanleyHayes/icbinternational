'use client';

/**
 * The fields each destination needs, and only those.
 *
 * Split by kind rather than shown all at once behind `hidden`, because a form that hides eleven
 * fields still tabs through eleven fields with a screen reader. Each block is short enough to read
 * on a phone without scrolling past the amount.
 *
 * `onDetailsBlur` fires on the fields that identify the account. That is what triggers
 * confirmation of payee, and it is attached to the inputs rather than to a wrapper so the
 * behaviour belongs to a real form control.
 */

import type { Account } from '@reliance/contracts';
import { FormField, Input, Select } from '@reliance/ui';

import { COUNTRIES } from '@/lib/countries';

import { accountOptions } from '../money/use-accounts';

import type { DestinationDraft } from './destination-draft';

const ACCOUNT_NUMBER_LENGTH = 10;
const SORT_CODE_LENGTH = 6;
const BIC_MAX_LENGTH = 11;
const NON_DIGIT = /\D/g;

/** Props shared by the typed-destination blocks. */
export interface DestinationFieldsProps {
  readonly draft: DestinationDraft;
  readonly onChange: (patch: Partial<DestinationDraft>) => void;
  readonly errors: Readonly<Record<string, string>>;
  /** Runs when a field identifying the account loses focus. */
  readonly onDetailsBlur?: () => void;
}

/** Props for {@link OwnAccountFields}. */
export interface OwnAccountFieldsProps {
  readonly draft: DestinationDraft;
  readonly onChange: (patch: Partial<DestinationDraft>) => void;
  /** The customer's other accounts; the source is already excluded by the caller. */
  readonly accounts: readonly Account[];
}

/** Moving money between the customer's own accounts. */
export function OwnAccountFields({ draft, onChange, accounts }: OwnAccountFieldsProps) {
  return (
    <FormField label="To" hint="Money moves between your own accounts straight away." required>
      <Select
        options={accountOptions(accounts)}
        value={draft.toAccountId}
        placeholder={draft.toAccountId ? undefined : 'Choose an account'}
        onChange={(event) => onChange({ toAccountId: event.target.value })}
      />
    </FormField>
  );
}

/** Paying another Reliance Bank customer. */
export function RelianceFields({ draft, onChange, errors }: DestinationFieldsProps) {
  return (
    <FormField
      label="Account number, email address or @handle"
      hint="Payments between Reliance accounts arrive in seconds."
      error={errors.relianceRef}
      required
    >
      <Input
        value={draft.relianceRef}
        autoComplete="off"
        onChange={(event) => onChange({ relianceRef: event.target.value })}
      />
    </FormField>
  );
}

/** The name the receiving bank is expected to hold. */
function AccountNameField({ draft, onChange, errors, onDetailsBlur }: DestinationFieldsProps) {
  return (
    <FormField
      className="sm:col-span-2"
      label="Name on the account"
      hint="Exactly as the bank holds it. We check it with them before you send anything."
      error={errors.accountName}
      required
    >
      <Input
        value={draft.accountName}
        autoComplete="off"
        onBlur={onDetailsBlur}
        onChange={(event) => onChange({ accountName: event.target.value })}
      />
    </FormField>
  );
}

/** Paying an account at another UK bank. */
export function DomesticFields(props: DestinationFieldsProps) {
  const { draft, onChange, errors, onDetailsBlur } = props;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AccountNameField {...props} />

      <FormField label="Sort code" error={errors.sortCode} required>
        <Input
          value={draft.sortCode}
          inputMode="numeric"
          maxLength={SORT_CODE_LENGTH}
          placeholder="000000"
          onBlur={onDetailsBlur}
          onChange={(event) => onChange({ sortCode: event.target.value.replaceAll(NON_DIGIT, '') })}
        />
      </FormField>

      <FormField label="Account number" error={errors.accountNumber} required>
        <Input
          value={draft.accountNumber}
          inputMode="numeric"
          maxLength={ACCOUNT_NUMBER_LENGTH}
          placeholder="0000000000"
          onBlur={onDetailsBlur}
          onChange={(event) =>
            onChange({ accountNumber: event.target.value.replaceAll(NON_DIGIT, '') })
          }
        />
      </FormField>
    </div>
  );
}

/** The bank's own identifiers on an international payment. */
function BankIdentifierFields({ draft, onChange, errors, onDetailsBlur }: DestinationFieldsProps) {
  return (
    <>
      <FormField className="sm:col-span-2" label="IBAN" error={errors.iban} required>
        <Input
          value={draft.iban}
          autoComplete="off"
          className="font-mono uppercase"
          onBlur={onDetailsBlur}
          onChange={(event) => onChange({ iban: event.target.value.toUpperCase() })}
        />
      </FormField>

      <FormField label="SWIFT / BIC" error={errors.bic} required>
        <Input
          value={draft.bic}
          autoComplete="off"
          maxLength={BIC_MAX_LENGTH}
          className="font-mono uppercase"
          onBlur={onDetailsBlur}
          onChange={(event) => onChange({ bic: event.target.value.toUpperCase() })}
        />
      </FormField>

      <FormField label="Bank name" error={errors.bankName} required>
        <Input
          value={draft.bankName}
          autoComplete="off"
          onChange={(event) => onChange({ bankName: event.target.value })}
        />
      </FormField>
    </>
  );
}

/** Paying a bank outside the United Kingdom. */
export function InternationalFields(props: DestinationFieldsProps) {
  const { draft, onChange, errors } = props;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AccountNameField {...props} />
      <BankIdentifierFields {...props} />

      <FormField
        className="sm:col-span-2"
        label="Country of the bank"
        hint="Correspondent banks in some countries add their own charges. We tell you before you send."
        error={errors.country}
        required
      >
        <Select
          options={COUNTRIES}
          value={draft.country}
          onChange={(event) => onChange({ country: event.target.value })}
        />
      </FormField>
    </div>
  );
}
