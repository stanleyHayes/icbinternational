'use client';

/**
 * The loans the customer is actually paying.
 *
 * Arrears lead, because a loan behind on payments is the only thing on this screen that costs
 * money by being ignored. The next payment date and amount are on the row for the same reason.
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { LoanStatus, type Loan } from '@reliance/contracts';
import { cn, StatusPill } from '@reliance/ui';

import { EmptyPanel } from '@/components/shell';
import { laneRoutes, MoneyCell, movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

import { LOAN_KIND, LOAN_STATUS } from './lending-look';

const NO_LOANS = (
  <EmptyPanel
    title="You are not borrowing anything"
    description="Loans and overdrafts you take out will appear here with what is left to pay and when the next payment is due."
  />
);

/** When the next instalment is due, or why there is not one. */
function nextLine(loan: Loan): string {
  if (loan.status === LoanStatus.SETTLED) return 'Fully repaid';
  if (!loan.nextPaymentDate) return 'No payment scheduled';
  return `Next payment ${formatDate(loan.nextPaymentDate)}`;
}

function LoanRow({ loan }: { readonly loan: Loan }) {
  const status = LOAN_STATUS[loan.status];

  return (
    <li>
      <Link
        href={laneRoutes.borrow.loan(loan.id)}
        className={cn(
          'hover:bg-surface-sunken flex items-center justify-between gap-3 rounded-md px-3 py-3',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <span className="min-w-0">
          <span className="text-fg block truncate text-sm font-medium">
            {loan.productName || LOAN_KIND[loan.kind]}
          </span>
          <span className="text-fg-muted mt-0.5 block text-xs">{nextLine(loan)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <StatusPill tone={status.tone} label={status.label} />
          <MoneyCell money={loan.outstandingBalance} srLabel="Left to pay" />
        </span>
      </Link>
    </li>
  );
}

/**
 * @example <LoansPanel />
 */
export function LoansPanel() {
  const loans = useQuery({
    queryKey: movementKeys.borrow.loans(),
    queryFn: async () => (await browserApi().borrow.list()).data,
  });

  return (
    <Section
      title="What you are borrowing"
      description="Every loan and overdraft you hold with us."
    >
      <QueryPanel
        query={loans}
        skeletonRows={2}
        isEmpty={(list) => list.length === 0}
        empty={NO_LOANS}
      >
        {(list) => (
          <ul className="divide-border -mx-3 flex flex-col divide-y">
            {list.map((loan) => (
              <LoanRow key={loan.id} loan={loan} />
            ))}
          </ul>
        )}
      </QueryPanel>
    </Section>
  );
}
