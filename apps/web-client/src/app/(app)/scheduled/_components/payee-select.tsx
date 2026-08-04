'use client';

/**
 * Choosing which saved payee a schedule pays.
 *
 * A standing order can only pay somebody the customer has already saved, and the API models it
 * that way: the request carries a `beneficiaryId`, not a set of account details. So the picker is
 * a select over saved payees, with a clear route out when the list is empty rather than a dead end.
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { FormField, Select } from '@reliance/ui';

import { describeDestination, laneRoutes, movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';

const PAYEE_LIMIT = 100;

/** Props for {@link PayeeSelect}. */
export interface PayeeSelectProps {
  readonly value: string;
  readonly onChange: (beneficiaryId: string) => void;
  readonly error?: string;
}

/**
 * @example <PayeeSelect value={draft.beneficiaryId} onChange={setPayee} />
 */
export function PayeeSelect({ value, onChange, error }: PayeeSelectProps) {
  const filters = { limit: PAYEE_LIMIT };
  const payees = useQuery({
    queryKey: movementKeys.beneficiaries.list(filters),
    queryFn: async () => (await browserApi().beneficiaries.list(filters)).data,
  });

  const options = (payees.data ?? []).map((payee) => ({
    value: payee.id,
    label: `${payee.nickname} · ${describeDestination(payee.destination)}`,
  }));

  const hint =
    options.length === 0 && !payees.isPending
      ? 'A standing order pays someone you have saved.'
      : undefined;

  return (
    <div className="flex flex-col gap-2">
      <FormField label="Pay" error={error} hint={hint} required>
        <Select
          options={options}
          value={value}
          disabled={payees.isPending || options.length === 0}
          placeholder={value ? undefined : 'Choose a payee'}
          onChange={(event) => onChange(event.target.value)}
        />
      </FormField>

      {options.length === 0 && !payees.isPending ? (
        <Link
          href={laneRoutes.payees.add}
          className="text-accent text-sm font-medium hover:underline"
        >
          Add a payee first
        </Link>
      ) : null}
    </div>
  );
}
