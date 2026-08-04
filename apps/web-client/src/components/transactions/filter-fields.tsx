'use client';

/**
 * The filter controls themselves.
 *
 * Native `<select>` and `<input type="date">` throughout, via the design system. On a phone that
 * gives the platform date wheel and the platform picker, which is faster than anything a bank can
 * build and is already familiar to the person holding it.
 *
 * Amounts are typed in pounds and pence and stored in the URL as minor units. The conversion goes
 * through `@reliance/money`, so `12.345` is rejected rather than silently rounded — a filter that
 * quietly changes what you asked for is worse than one that says it cannot.
 */

import { TransactionDirection, type TransactionStatus, type Account } from '@reliance/contracts';
import { parseMajorToMinor, formatMinorToMajor, type CurrencyCode } from '@reliance/money';
import { FormField, Input, Select, type SelectOption } from '@reliance/ui';

import type { TransactionFilters } from './filters';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  DIRECTION_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
} from './labels';

const ANY = '';

const ANY_OPTION: SelectOption = { value: ANY, label: 'Any' };

const DIRECTION_OPTIONS: readonly SelectOption[] = [
  ANY_OPTION,
  ...Object.values(TransactionDirection).map((value) => ({
    value,
    label: DIRECTION_LABEL[value],
  })),
];

const STATUS_OPTIONS: readonly SelectOption[] = [
  ANY_OPTION,
  ...STATUS_ORDER.map((value) => ({ value, label: STATUS_LABEL[value] })),
];

const CATEGORY_OPTIONS: readonly SelectOption[] = [
  ANY_OPTION,
  ...CATEGORY_ORDER.map((value) => ({ value, label: CATEGORY_LABEL[value] })),
];

/** Converts a typed amount to minor units, or `null` when it is blank or not a valid amount. */
function toMinor(value: string, currency: CurrencyCode): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return parseMajorToMinor(trimmed, currency).toString();
  } catch {
    return null;
  }
}

/** Props for {@link FilterFields}. */
export interface FilterFieldsProps {
  readonly filters: TransactionFilters;
  readonly onChange: (changes: Partial<TransactionFilters>) => void;
  /** Accounts the customer holds, for the account selector. */
  readonly accounts: readonly Account[];
  /** Currency the amount fields are typed in. */
  readonly currency: CurrencyCode;
}

/** Digits of an account number that may be shown. */
const VISIBLE_DIGITS = 4;

function accountOptions(accounts: readonly Account[]): readonly SelectOption[] {
  return [
    { value: ANY, label: 'All accounts' },
    ...accounts.map((account) => ({
      value: account.id,
      label: `${account.nickname ?? account.productName} · ${account.number.slice(-VISIBLE_DIGITS)}`,
    })),
  ];
}

function ScopeFields({ filters, onChange, accounts }: Omit<FilterFieldsProps, 'currency'>) {
  return (
    <>
      <FormField label="Account">
        <Select
          options={accountOptions(accounts)}
          value={filters.accountId ?? ANY}
          onChange={(event) => onChange({ accountId: event.target.value || null })}
        />
      </FormField>

      <FormField label="Money in or out">
        <Select
          options={DIRECTION_OPTIONS}
          value={filters.direction ?? ANY}
          onChange={(event) =>
            onChange({ direction: (event.target.value as TransactionDirection) || null })
          }
        />
      </FormField>

      <FormField label="Status">
        <Select
          options={STATUS_OPTIONS}
          value={filters.status ?? ANY}
          onChange={(event) =>
            onChange({ status: (event.target.value as TransactionStatus) || null })
          }
        />
      </FormField>

      <FormField label="Category">
        <Select
          options={CATEGORY_OPTIONS}
          value={filters.category ?? ANY}
          onChange={(event) =>
            onChange({ category: (event.target.value as TransactionFilters['category']) || null })
          }
        />
      </FormField>
    </>
  );
}

function DateFields({ filters, onChange }: Pick<FilterFieldsProps, 'filters' | 'onChange'>) {
  return (
    <>
      <FormField label="From date">
        <Input
          type="date"
          value={filters.from ?? ''}
          max={filters.to ?? undefined}
          onChange={(event) => onChange({ from: event.target.value || null })}
        />
      </FormField>

      <FormField label="To date">
        <Input
          type="date"
          value={filters.to ?? ''}
          min={filters.from ?? undefined}
          onChange={(event) => onChange({ to: event.target.value || null })}
        />
      </FormField>
    </>
  );
}

function AmountFields({ filters, onChange, currency }: Omit<FilterFieldsProps, 'accounts'>) {
  const major = (minor: string | null): string =>
    minor === null ? '' : formatMinorToMajor(BigInt(minor), currency);

  return (
    <>
      <FormField label="Amount from" hint="Leave blank for no lower limit">
        <Input
          type="text"
          inputMode="decimal"
          defaultValue={major(filters.minAmount)}
          onBlur={(event) => onChange({ minAmount: toMinor(event.target.value, currency) })}
        />
      </FormField>

      <FormField label="Amount to" hint="Leave blank for no upper limit">
        <Input
          type="text"
          inputMode="decimal"
          defaultValue={major(filters.maxAmount)}
          onBlur={(event) => onChange({ maxAmount: toMinor(event.target.value, currency) })}
        />
      </FormField>
    </>
  );
}

/** The grid of filter controls, shown inside the filter panel. */
export function FilterFields({ filters, onChange, accounts, currency }: FilterFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ScopeFields filters={filters} onChange={onChange} accounts={accounts} />
      <DateFields filters={filters} onChange={onChange} />
      <AmountFields filters={filters} onChange={onChange} currency={currency} />
    </div>
  );
}
