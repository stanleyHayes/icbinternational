/**
 * How an operator narrows the whole bank down to the posting they are looking for.
 *
 * Amounts are entered in major units because that is what the customer quoted on the
 * phone, and converted to minor units here — the one place the conversion happens, so a
 * search for "£19.99" cannot become a search for nineteen pence somewhere else.
 */

import {
  EntryType,
  TransactionDirection,
  TransactionStatus,
  type ListTransactionsQuery,
} from '@reliance/contracts';
import type { SelectOption } from '@reliance/ui';

import type { FilterSpec } from '@/components/shell/ops';
import { humaniseCode } from '@/lib/format';

/** Minor units in one major unit for the reporting currency. */
const MINOR_UNITS_PER_MAJOR = 100n;

/** Start of a calendar day, in the UTC the platform records against. */
export const DAY_START = 'T00:00:00Z';

/** End of a calendar day, in the UTC the platform records against. */
export const DAY_END = 'T23:59:59Z';

function options(values: readonly string[]): readonly SelectOption[] {
  return values.map((value) => ({ value, label: humaniseCode(value) }));
}

/** The filters above the posting search. */
export const POSTING_FILTERS: readonly FilterSpec[] = [
  {
    id: 'search',
    label: 'Narrative, reference or counterparty',
    kind: 'text',
    placeholder: 'Search postings',
  },
  {
    id: 'direction',
    label: 'Direction',
    kind: 'select',
    options: options(Object.values(TransactionDirection)),
  },
  {
    id: 'status',
    label: 'Status',
    kind: 'select',
    options: options(Object.values(TransactionStatus)),
  },
  { id: 'type', label: 'Entry type', kind: 'select', options: options(Object.values(EntryType)) },
  { id: 'accountId', label: 'Account', kind: 'text', placeholder: 'acc_…' },
  { id: 'minAmount', label: 'From amount', kind: 'text', placeholder: '0.00' },
  { id: 'maxAmount', label: 'To amount', kind: 'text', placeholder: '0.00' },
  { id: 'from', label: 'Booked from', kind: 'date' },
  { id: 'to', label: 'Booked to', kind: 'date' },
];

/**
 * A major-unit amount as integer minor units, or `undefined` when it is not a number.
 *
 * Parsed digit by digit rather than through `Number`, because a search box is a place a
 * float would otherwise enter the system unnoticed.
 */
export function toMinorUnits(major: string): string | undefined {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(major.trim());
  if (!match) return undefined;

  const whole = BigInt(match[1] ?? '0');
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0'));
  return (whole * MINOR_UNITS_PER_MAJOR + fraction).toString();
}

function trimmed(values: Readonly<Record<string, string>>, key: string): string | undefined {
  const value = values[key]?.trim();
  return value ? value : undefined;
}

/** Turns the filter bar's values into the query the platform accepts. */
/**
 * Drops every key whose value is empty.
 *
 * The query is built by listing each field's converted value and then removing the blanks,
 * rather than by a conditional spread per field. Both produce the same object, but the
 * spread version puts a branch in the function for every filter the screen grows, and an
 * omitted filter is not a decision worth spending one on: it is simply absent.
 */
function withoutBlanks<T extends object>(candidate: T): T {
  return Object.fromEntries(
    Object.entries(candidate).filter(([, value]) => value !== undefined && value !== ''),
  ) as T;
}

export function toPostingQuery(
  values: Readonly<Record<string, string>>,
  limit: number,
): ListTransactionsQuery {
  const from = trimmed(values, 'from');
  const to = trimmed(values, 'to');
  const minAmount = trimmed(values, 'minAmount');
  const maxAmount = trimmed(values, 'maxAmount');

  return {
    limit,
    ...withoutBlanks({
      search: values.search?.trim(),
      direction: values.direction as TransactionDirection | undefined,
      status: values.status as TransactionStatus | undefined,
      type: values.type as EntryType | undefined,
      accountId: values.accountId?.trim(),
      minAmount: minAmount ? toMinorUnits(minAmount) : undefined,
      maxAmount: maxAmount ? toMinorUnits(maxAmount) : undefined,
      // A date filter names a whole day, so it is widened to that day's bounds.
      from: from ? `${from}${DAY_START}` : undefined,
      to: to ? `${to}${DAY_END}` : undefined,
    }),
  };
}
