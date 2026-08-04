'use client';

/**
 * One loan.
 *
 * Arrears first when there are any, because everything else on the screen matters less than the
 * fact that a payment was missed. Then the figures, then the schedule, then the ways to pay.
 */

import { useQuery } from '@tanstack/react-query';

import { LoanStatus, type Loan } from '@reliance/contracts';
import { Alert, StatusPill } from '@reliance/ui';

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

import { AmortisationTable } from './amortisation-table';
import { aprLabel, LOAN_KIND, LOAN_STATUS } from './lending-look';
import { RepayPanel } from './repay-panel';

/** Props for {@link LoanDetail}. */
export interface LoanDetailProps {
  readonly loanId: string;
}

function loanRows(loan: Loan): Detail[] {
  return [
    {
      id: 'outstanding',
      label: 'Left to pay',
      value: <MoneyCell money={loan.outstandingBalance} size="lg" srLabel="Balance outstanding" />,
    },
    { id: 'apr', label: 'Rate', value: `${aprLabel(loan.aprBps)} APR` },
    {
      id: 'monthly',
      label: 'Each month',
      value: <MoneyCell money={loan.monthlyPayment} muted />,
    },
    {
      id: 'next',
      label: 'Next payment',
      value: loan.nextPaymentDate ? formatDate(loan.nextPaymentDate) : 'None scheduled',
      note: `${loan.instalmentsPaid} paid, ${loan.instalmentsRemaining} to go`,
    },
    { id: 'matures', label: 'Finishes on', value: formatDate(loan.maturesOn) },
  ];
}

/** The line that has to be at the top when a payment has been missed. */
function ArrearsNotice({ loan }: { readonly loan: Loan }) {
  if (loan.status !== LoanStatus.IN_ARREARS) return null;

  return (
    <Alert tone="danger" title="This loan is behind on payments">
      <p>
        <MoneyCell money={loan.arrearsAmount} muted srLabel="Amount overdue" /> is overdue, by{' '}
        {loan.daysPastDue} days. Paying it now stops further charges.
      </p>
      <p className="mt-2">
        If you are struggling, call us on 0800 460 0460. We can usually agree a plan, and doing that
        early costs you far less than leaving it.
      </p>
    </Alert>
  );
}

/** The repayment schedule for a live loan. */
function SchedulePanel({ loanId }: { readonly loanId: string }) {
  const schedule = useQuery({
    queryKey: movementKeys.borrow.schedule(loanId),
    queryFn: async () => (await browserApi().borrow.schedule(loanId)).data,
  });

  return (
    <Section title="Repayment schedule" description="Every instalment, exactly as we will take it.">
      <QueryPanel query={schedule} skeletonRows={3}>
        {(rows) => <AmortisationTable rows={rows} />}
      </QueryPanel>
    </Section>
  );
}

function DetailBody({ loan }: { readonly loan: Loan }) {
  const status = LOAN_STATUS[loan.status];

  return (
    <div className="flex flex-col gap-6">
      <ArrearsNotice loan={loan} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <Section
          title={loan.productName || LOAN_KIND[loan.kind]}
          description={`Taken out on ${formatDate(loan.disbursedAt)}`}
          action={<StatusPill tone={status.tone} label={status.label} />}
        >
          <DetailList items={loanRows(loan)} />
        </Section>

        {loan.status === LoanStatus.SETTLED ? null : <RepayPanel loan={loan} />}
      </div>

      <SchedulePanel loanId={loan.id} />
    </div>
  );
}

/**
 * @example <LoanDetail loanId={loanId} />
 */
export function LoanDetail({ loanId }: LoanDetailProps) {
  const loan = useQuery({
    queryKey: movementKeys.borrow.loan(loanId),
    queryFn: async () => (await browserApi().borrow.get(loanId)).data,
  });

  return (
    <QueryPanel query={loan} skeletonRows={4}>
      {(data) => <DetailBody loan={data} />}
    </QueryPanel>
  );
}
