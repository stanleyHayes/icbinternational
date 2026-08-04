'use client';

/**
 * One standing order.
 *
 * What it pays, how often, when next, and what has happened to it so far. Amending is limited to
 * the fields the API lets a customer change — the amount, the reference and when it ends. Changing
 * the payee is not an amendment, it is a different standing order, and pretending otherwise is how
 * a customer's rent ends up going somewhere else.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { TransferOrder } from '@reliance/contracts';
import { Button, MoneyText, StatusPill } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  AmountField,
  DetailList,
  laneRoutes,
  movementKeys,
  ORDER_STATUS,
  QueryPanel,
  Section,
  type Detail,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

import { FREQUENCY_LABEL } from './frequency';
import { OrderActions } from './order-actions';

/** Props for {@link OrderDetail}. */
export interface OrderDetailProps {
  readonly orderId: string;
}

function summaryRows(order: TransferOrder): Detail[] {
  return [
    {
      id: 'amount',
      label: 'Amount each time',
      value: (
        <MoneyText
          amount={order.amount.amount}
          currency={order.amount.currency}
          size="lg"
          srLabel="Amount of each payment"
        />
      ),
    },
    { id: 'frequency', label: 'How often', value: FREQUENCY_LABEL[order.frequency] },
    {
      id: 'next',
      label: 'Next payment',
      value: order.nextRunAt ? formatDate(order.nextRunAt) : 'None scheduled',
    },
    {
      id: 'last',
      label: 'Last payment',
      value: order.lastRunAt ? formatDate(order.lastRunAt) : 'Not yet run',
    },
    { id: 'started', label: 'Started', value: formatDate(order.startsOn) },
    {
      id: 'ends',
      label: 'Ends',
      value: order.endsOn ? formatDate(order.endsOn) : 'When you stop it',
    },
    { id: 'run', label: 'Payments made', value: String(order.occurrencesRun) },
    ...(order.reference ? [{ id: 'reference', label: 'Reference', value: order.reference }] : []),
  ];
}

/** Changing the amount on a live standing order. */
function AmendPanel({ order }: { readonly order: TransferOrder }) {
  const cache = useQueryClient();
  const [amount, setAmount] = useState(order.amount.amount);

  const amend = useMutation({
    mutationFn: async () => {
      await browserApi().transferOrders.update(order.id, {
        amount: { amount, currency: order.amount.currency },
      });
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.transferOrders.all });
    },
  });

  return (
    <Section title="Change the amount" description="The new amount applies from the next payment.">
      <div className="flex flex-col gap-4">
        <FormAlert error={amend.error} />
        <AmountField
          label="New amount"
          currency={order.amount.currency}
          value={amount}
          onChange={setAmount}
        />
        <div className="flex justify-end">
          <Button
            loading={amend.isPending}
            disabled={amount === order.amount.amount || amount === ''}
            onClick={() => amend.mutate()}
          >
            Save the new amount
          </Button>
        </div>
      </div>
    </Section>
  );
}

function DetailBody({ order }: { readonly order: TransferOrder }) {
  const router = useRouter();
  const status = ORDER_STATUS[order.status];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <Section
        title={order.name}
        description="What this standing order pays, and when."
        action={<StatusPill tone={status.tone} label={status.label} />}
      >
        <DetailList items={summaryRows(order)} />
        <div className="border-border mt-5 border-t pt-4">
          <OrderActions order={order} onCancelled={() => router.push(laneRoutes.scheduled.index)} />
        </div>
      </Section>

      <AmendPanel order={order} />
    </div>
  );
}

/**
 * @example <OrderDetail orderId={orderId} />
 */
export function OrderDetail({ orderId }: OrderDetailProps) {
  const order = useQuery({
    queryKey: movementKeys.transferOrders.detail(orderId),
    queryFn: async () => (await browserApi().transferOrders.get(orderId)).data,
  });

  return (
    <QueryPanel query={order} skeletonRows={4}>
      {(data) => <DetailBody order={data} />}
    </QueryPanel>
  );
}
