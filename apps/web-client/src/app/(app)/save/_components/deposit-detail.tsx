'use client';

/**
 * One fixed deposit.
 *
 * Interest accrued so far and the value at maturity, because those are the two figures somebody
 * checks. The break panel is offered underneath while the deposit is live, and never once it has
 * matured or been broken — a control that would only ever produce an error is not a control.
 */

import { useQuery } from '@tanstack/react-query';

import { DepositStatus, type Deposit } from '@reliance/contracts';
import { StatusPill } from '@reliance/ui';

import {
  DetailList,
  MoneyCell,
  movementKeys,
  QueryPanel,
  Section,
  type Detail,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

import { BreakDeposit } from './break-deposit';
import { percentFromBps, termLabel } from './rate-table';

/** Props for {@link DepositDetail}. */
export interface DepositDetailProps {
  readonly depositId: string;
}

function depositRows(deposit: Deposit): Detail[] {
  return [
    {
      id: 'principal',
      label: 'Amount deposited',
      value: <MoneyCell money={deposit.principal} size="lg" srLabel="Amount deposited" />,
    },
    { id: 'rate', label: 'Annual rate', value: percentFromBps(deposit.annualRateBps) },
    { id: 'term', label: 'Term', value: termLabel(deposit.termMonths) },
    {
      id: 'accrued',
      label: 'Interest earned so far',
      value: <MoneyCell money={deposit.interestAccrued} muted />,
    },
    {
      id: 'maturity',
      label: 'Worth at maturity',
      value: <MoneyCell money={deposit.maturityValue} muted />,
      note: `Matures on ${formatDate(deposit.maturesOn)}`,
    },
    {
      id: 'rollover',
      label: 'At the end of the term',
      value: deposit.autoRollover
        ? 'We open a new deposit at the rate that applies then'
        : 'The money goes back to your account',
    },
  ];
}

function DetailBody({ deposit }: { readonly deposit: Deposit }) {
  const live = deposit.status === DepositStatus.ACTIVE;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <Section
        title="Your fixed deposit"
        description={`Placed on ${formatDate(deposit.placedAt)}`}
        action={
          <StatusPill
            tone={live ? 'credit' : 'neutral'}
            label={live ? 'Earning interest' : 'Finished'}
          />
        }
      >
        <DetailList items={depositRows(deposit)} />
      </Section>

      {live ? <BreakDeposit deposit={deposit} /> : null}
    </div>
  );
}

/**
 * @example <DepositDetail depositId={depositId} />
 */
export function DepositDetail({ depositId }: DepositDetailProps) {
  const deposit = useQuery({
    queryKey: movementKeys.save.deposit(depositId),
    queryFn: async () => (await browserApi().save.getDeposit(depositId)).data,
  });

  return (
    <QueryPanel query={deposit} skeletonRows={3}>
      {(data) => <DetailBody deposit={data} />}
    </QueryPanel>
  );
}
