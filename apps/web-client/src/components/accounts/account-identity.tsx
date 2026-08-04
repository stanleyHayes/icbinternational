'use client';

/**
 * The details somebody needs in order to pay this account.
 *
 * Sort code and account number for a domestic payment, IBAN for one from abroad, and both are
 * copyable in the exact form the receiving form expects. Everything else on the panel is the
 * product's terms, which belong here rather than in a help article: a customer asking "what rate
 * am I getting" is asking about *this* account, not about the product page.
 */

import type { Account } from '@reliance/contracts';
import { Card, CardHeader } from '@reliance/ui';

import { DefinitionList, type DefinitionRow } from '@/components/transactions/definition-list';
import { formatDate } from '@/lib/format';

import { CopyValue } from './copy-value';
import {
  ACCOUNT_STATUS_EXPLANATION,
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_TYPE_LABEL,
  formatIban,
  formatRateBps,
  formatSortCode,
} from './labels';

/**
 * The identifiers someone needs to pay into this account.
 *
 * Each is copyable, and the copied value is the raw one rather than the formatted one: a
 * sort code pasted as "04-99-21" is rejected by most payment forms.
 */
function paymentRows(account: Account): readonly DefinitionRow[] {
  return [
    {
      label: 'Sort code',
      value: (
        <CopyValue
          label="sort code"
          display={formatSortCode(account.sortCode)}
          value={account.sortCode}
        />
      ),
    },
    {
      label: 'Account number',
      value: <CopyValue label="account number" display={account.number} />,
    },
    {
      label: 'IBAN',
      value: <CopyValue label="IBAN" display={formatIban(account.iban)} value={account.iban} />,
      hint: 'Use this for payments from outside the United Kingdom',
    },
  ];
}

function identityRows(account: Account): readonly DefinitionRow[] {
  return [
    { label: 'Account name', value: account.nickname ?? account.productName },
    { label: 'Product', value: account.productName, hint: ACCOUNT_TYPE_LABEL[account.type] },
    ...paymentRows(account),
    { label: 'Currency', value: account.currency },
    {
      label: 'Interest',
      value:
        account.interestRateBps === null
          ? 'No interest on this account'
          : formatRateBps(account.interestRateBps),
    },
    { label: 'Opened', value: formatDate(account.openedAt) },
    {
      label: 'Closed',
      value: account.closedAt ? formatDate(account.closedAt) : null,
    },
    {
      label: 'Status',
      value: ACCOUNT_STATUS_LABEL[account.status],
      hint: ACCOUNT_STATUS_EXPLANATION[account.status],
    },
  ];
}

/** Props for {@link AccountIdentity}. */
export interface AccountIdentityProps {
  readonly account: Account;
}

/**
 * @example <AccountIdentity account={account} />
 */
export function AccountIdentity({ account }: AccountIdentityProps) {
  return (
    <Card>
      <CardHeader
        title="Account details"
        description="Share the sort code and account number for payments in the United Kingdom, or the IBAN from abroad."
      />
      <DefinitionList className="mt-2" rows={identityRows(account)} />
    </Card>
  );
}
