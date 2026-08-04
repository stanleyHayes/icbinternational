'use client';

/**
 * Choosing which account the money comes from.
 *
 * The available balance is shown beside the picker, not inside the option labels: a `<select>`
 * cannot render rich content, and a customer who has to open the list to remember what they can
 * spend will open it every time. Available, never ledger — money on hold has already been spoken
 * for, and offering it as spendable is how a payment gets refused after the review screen.
 */

import type { Account } from '@reliance/contracts';
import { FormField, MoneyText, Select } from '@reliance/ui';

import { accountOptions } from './use-accounts';

/** Props for {@link AccountSelect}. */
export interface AccountSelectProps {
  readonly label: string;
  readonly accounts: readonly Account[];
  readonly value: string;
  readonly onChange: (accountId: string) => void;
  /** Shown under the control instead of the balance strip. */
  readonly hint?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  /** Hides the available-balance strip — for a destination picker, where it is not the point. */
  readonly hideBalance?: boolean;
}

/**
 * @example
 * <AccountSelect label="From" accounts={accounts} value={sourceId} onChange={setSourceId} />
 */
export function AccountSelect({
  label,
  accounts,
  value,
  onChange,
  hint,
  error,
  disabled,
  hideBalance = false,
}: AccountSelectProps) {
  const chosen = accounts.find((account) => account.id === value);

  return (
    <div className="flex flex-col gap-2">
      <FormField label={label} error={error ?? null} {...(hint ? { hint } : {})} required>
        <Select
          options={accountOptions(accounts)}
          value={value}
          disabled={disabled}
          placeholder={value ? undefined : 'Choose an account'}
          onChange={(event) => onChange(event.target.value)}
        />
      </FormField>

      {chosen && !hideBalance ? (
        <p className="text-fg-muted flex items-baseline justify-between gap-3 text-sm">
          <span>Available to spend</span>
          <MoneyText
            amount={chosen.balance.available.amount}
            currency={chosen.balance.available.currency}
            srLabel="Available balance"
            muted
          />
        </p>
      ) : null}
    </div>
  );
}
