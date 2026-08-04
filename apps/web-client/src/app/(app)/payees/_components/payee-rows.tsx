'use client';

/**
 * A saved payee's details, as label-and-value pairs.
 *
 * The confirmation-of-payee outcome is kept on the payee rather than thrown away after the check,
 * because "we could not confirm this account belongs to who you think" stays true until somebody
 * checks again — and a payee saved during a scam is the one a customer most needs reminding about.
 */

import { NameCheckResult, type Beneficiary, type TransferDestination } from '@reliance/contracts';
import { StatusPill, type Tone } from '@reliance/ui';

import type { Detail } from '@/components/transfers';
import { countryName } from '@/lib/countries';
import { relativeTime } from '@/lib/format';

const SORT_CODE_GROUP = /(\d{2})(?=\d)/g;

/** How each confirmation-of-payee outcome reads on the payee itself. */
const CHECK_LOOK: Readonly<Record<NameCheckResult, { label: string; tone: Tone }>> = {
  [NameCheckResult.MATCH]: { label: 'Name confirmed by their bank', tone: 'success' },
  [NameCheckResult.CLOSE_MATCH]: { label: 'Name was a close match only', tone: 'warning' },
  [NameCheckResult.NO_MATCH]: { label: 'Name did not match', tone: 'danger' },
  [NameCheckResult.UNAVAILABLE]: { label: 'Their bank could not confirm the name', tone: 'info' },
};

function destinationRows(destination: TransferDestination): Detail[] {
  if (destination.kind === 'INTERNAL') {
    return [
      {
        id: 'account',
        label: 'Reliance account',
        value: destination.accountNumber ?? destination.handle ?? destination.email ?? '—',
      },
    ];
  }

  if (destination.kind === 'DOMESTIC') {
    return [
      { id: 'name', label: 'Name on the account', value: destination.accountName },
      {
        id: 'sort-code',
        label: 'Sort code',
        value: destination.sortCode.replaceAll(SORT_CODE_GROUP, '$1-'),
      },
      { id: 'number', label: 'Account number', value: destination.accountNumber },
      ...(destination.bankName ? [{ id: 'bank', label: 'Bank', value: destination.bankName }] : []),
    ];
  }

  return [
    { id: 'name', label: 'Name on the account', value: destination.accountName },
    {
      id: 'iban',
      label: 'IBAN',
      value: <span className="font-mono text-xs">{destination.iban}</span>,
    },
    {
      id: 'bic',
      label: 'SWIFT / BIC',
      value: <span className="font-mono text-xs">{destination.bic}</span>,
    },
    { id: 'bank', label: 'Bank', value: destination.bankName },
    { id: 'country', label: 'Country', value: countryName(destination.country) },
  ];
}

/** Every row shown on a payee's own screen. */
export function payeeRows(payee: Beneficiary): Detail[] {
  const check = CHECK_LOOK[payee.nameCheck];

  return [
    ...destinationRows(payee.destination),
    { id: 'currency', label: 'Currency', value: payee.currency },
    {
      id: 'name-check',
      label: 'Name check',
      value: <StatusPill tone={check.tone} label={check.label} />,
      note: payee.nameCheckSuggestion
        ? `Their bank holds the name as ${payee.nameCheckSuggestion}.`
        : undefined,
    },
    {
      id: 'last-used',
      label: 'Last paid',
      value: payee.lastUsedAt ? relativeTime(payee.lastUsedAt) : 'Not yet',
    },
  ];
}
