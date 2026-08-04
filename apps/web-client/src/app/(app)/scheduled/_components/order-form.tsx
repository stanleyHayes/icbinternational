'use client';

/**
 * Setting up a standing order.
 *
 * Nothing here moves money now, so there is no quote and no step-up. What there is instead is a
 * plain statement of what has been agreed: this much, this often, from this account, starting on
 * this date, until you say otherwise. A standing order that a customer misremembers is a standing
 * order that empties an account.
 */

import { useRouter } from 'next/navigation';

import type { Account } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import { Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  AccountSelect,
  AmountField,
  laneRoutes,
  Section,
  useUsableAccounts,
} from '@/components/transfers';

import { OrderNameFields } from './order-name-fields';
import { PayeeSelect } from './payee-select';
import { ScheduleFields } from './schedule-fields';
import { useOrderForm } from './use-order-form';

/**
 * @example <OrderForm />
 */
export function OrderForm() {
  const router = useRouter();
  const accounts = useUsableAccounts();
  const form = useOrderForm((order) => router.push(laneRoutes.scheduled.detail(order.id)));

  const source = accounts.data?.find((account) => account.id === form.draft.sourceAccountId);
  const currency = source?.currency ?? 'GBP';

  return (
    <Section
      title="Set up a standing order"
      description="A payment that repeats on a schedule you choose."
    >
      <div className="flex flex-col gap-6">
        <FormAlert error={form.create.error} />

        <OrderFields form={form} accounts={accounts.data ?? []} currency={currency} />

        <div className="flex justify-end">
          <Button
            onClick={() => form.submit(currency)}
            disabled={!form.ready}
            loading={form.create.isPending}
          >
            Set up this standing order
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Props for {@link OrderFields}. */
interface OrderFieldsProps {
  readonly form: ReturnType<typeof useOrderForm>;
  readonly accounts: readonly Account[];
  readonly currency: CurrencyCode;
}

/** Everything the customer fills in, in the order they think about it. */
function OrderFields({ form, accounts, currency }: OrderFieldsProps) {
  return (
    <>
      <OrderNameFields draft={form.draft} onChange={form.patch} field="name" />

      <PayeeSelect
        value={form.draft.beneficiaryId}
        onChange={(beneficiaryId) => form.patch({ beneficiaryId })}
      />

      <AccountSelect
        label="Pay from"
        accounts={accounts}
        value={form.draft.sourceAccountId}
        onChange={(sourceAccountId) => form.patch({ sourceAccountId })}
      />

      <AmountField
        label="Amount each time"
        currency={currency}
        value={form.draft.amount}
        onChange={(amount) => form.patch({ amount })}
      />

      <ScheduleFields draft={form.draft} onChange={form.patch} />

      <OrderNameFields draft={form.draft} onChange={form.patch} field="reference" />
    </>
  );
}
