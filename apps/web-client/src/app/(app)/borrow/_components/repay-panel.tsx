'use client';

/**
 * Making a payment against a loan, and settling it outright.
 *
 * An overpayment can either shorten the term or reduce the instalment, and the two are worth very
 * different amounts of money over a long loan. The API asks; so does this, in words rather than in
 * jargon.
 *
 * The early-settlement figure is fetched as a quote, because it includes accrued interest to today
 * and any early-repayment fee — a number that is wrong tomorrow.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Account, Loan, PayoffQuote } from '@reliance/contracts';
import { Button, Radio, RadioGroup } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  AccountSelect,
  AmountField,
  DetailList,
  MoneyCell,
  movementKeys,
  QueryPanel,
  Section,
  useUsableAccounts,
  type Detail,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

/** What an overpayment should do. */
type Effect = 'REDUCE_TERM' | 'REDUCE_INSTALMENT';

/** Props for {@link RepayPanel}. */
export interface RepayPanelProps {
  readonly loan: Loan;
}

/** Posts the repayment and refreshes the loan and the funding account together. */
function useRepay(loanId: string) {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      readonly fromAccountId: string;
      readonly amount: { amount: string; currency: Loan['principal']['currency'] };
      readonly overpaymentEffect: Effect;
    }) => (await browserApi().borrow.repay(loanId, body)).data,
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: movementKeys.borrow.all }),
        cache.invalidateQueries({ queryKey: queryKeys.accounts.all }),
      ]);
    },
  });
}

/** What settling the whole loan today would cost. */
function PayoffQuote({ loanId }: { readonly loanId: string }) {
  const quote = useQuery({
    queryKey: movementKeys.borrow.payoffQuote(loanId),
    queryFn: async () => (await browserApi().borrow.payoffQuote(loanId)).data,
  });

  return (
    <QueryPanel query={quote} skeletonRows={1}>
      {(data) => <DetailList items={payoffRows(data)} />}
    </QueryPanel>
  );
}

/** Every component of a settlement figure, so the total can be checked rather than trusted. */
function payoffRows(quote: PayoffQuote): Detail[] {
  return [
    {
      id: 'principal',
      label: 'Capital outstanding',
      value: <MoneyCell money={quote.outstandingPrincipal} muted />,
    },
    {
      id: 'interest',
      label: 'Interest to today',
      value: <MoneyCell money={quote.accruedInterest} muted />,
    },
    {
      id: 'rebate',
      label: 'Interest we give back',
      value: <MoneyCell money={quote.interestRebate} muted />,
    },
    {
      id: 'fee',
      label: 'Early repayment fee',
      value: <MoneyCell money={quote.earlyRepaymentFee} muted />,
    },
    {
      id: 'total',
      label: 'To settle it today',
      value: <MoneyCell money={quote.totalPayable} size="lg" srLabel="Total to settle" />,
      note: `This figure holds until ${formatDateTime(quote.validUntil)}.`,
    },
  ];
}

/**
 * @example <RepayPanel loan={loan} />
 */
/**
 * The payment being made, and the repayment it becomes.
 *
 * The amount is denominated in the loan's own currency rather than the funding account's:
 * a repayment settles the balance, so the balance decides the unit.
 */
function useRepayForm(loan: RepayPanelProps['loan']) {
  const [fromAccountId, setFromAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [effect, setEffect] = useState<Effect>('REDUCE_TERM');
  const repay = useRepay(loan.id);

  const submit = (): void => {
    if (!fromAccountId || !amount) return;
    repay.mutate({
      fromAccountId,
      amount: { amount, currency: loan.outstandingBalance.currency },
      overpaymentEffect: effect,
    });
  };

  return { fromAccountId, setFromAccountId, amount, setAmount, effect, setEffect, repay, submit };
}

export function RepayPanel({ loan }: RepayPanelProps) {
  const accounts = useUsableAccounts();
  const { fromAccountId, setFromAccountId, amount, setAmount, effect, setEffect, repay, submit } =
    useRepayForm(loan);

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Make a payment"
        description="Pay the instalment early, or overpay to clear it sooner."
      >
        <PaymentFields
          loan={loan}
          accounts={accounts.data ?? []}
          fromAccountId={fromAccountId}
          amount={amount}
          effect={effect}
          failure={repay.error}
          pending={repay.isPending}
          onAccount={setFromAccountId}
          onAmount={setAmount}
          onEffect={setEffect}
          onSubmit={submit}
        />
      </Section>

      <Section
        title="Settle it today"
        description="What it would cost to clear the whole loan now."
      >
        <PayoffQuote loanId={loan.id} />
      </Section>
    </div>
  );
}

/** The choice an overpayment forces, in plain terms. */
function OverpaymentEffect({
  value,
  onChange,
}: {
  readonly value: Effect;
  readonly onChange: (effect: Effect) => void;
}) {
  return (
    <RadioGroup legend="If you pay more than you owe this month" name="overpayment-effect">
      <Radio
        name="overpayment-effect"
        value="REDUCE_TERM"
        checked={value === 'REDUCE_TERM'}
        description="Keeps the monthly payment the same and finishes sooner. Usually costs less overall."
        onChange={() => onChange('REDUCE_TERM')}
      >
        Finish the loan sooner
      </Radio>
      <Radio
        name="overpayment-effect"
        value="REDUCE_INSTALMENT"
        checked={value === 'REDUCE_INSTALMENT'}
        description="Keeps the end date the same and lowers what you pay each month."
        onChange={() => onChange('REDUCE_INSTALMENT')}
      >
        Lower the monthly payment
      </Radio>
    </RadioGroup>
  );
}

/** Props for {@link PaymentFields}. */
interface PaymentFieldsProps {
  readonly loan: Loan;
  readonly accounts: readonly Account[];
  readonly fromAccountId: string;
  readonly amount: string;
  readonly effect: Effect;
  readonly failure: unknown;
  readonly pending: boolean;
  readonly onAccount: (accountId: string) => void;
  readonly onAmount: (amount: string) => void;
  readonly onEffect: (effect: Effect) => void;
  readonly onSubmit: () => void;
}

/** Where the money comes from, how much of it, and what an overpayment should do. */
function PaymentFields(props: PaymentFieldsProps) {
  const { loan, accounts, fromAccountId, amount, effect } = props;

  return (
    <div className="flex flex-col gap-4">
      <FormAlert error={props.failure} />

      <AccountSelect
        label="Pay from"
        accounts={accounts}
        value={fromAccountId}
        onChange={props.onAccount}
      />

      <AmountField
        label="Amount"
        currency={loan.outstandingBalance.currency}
        value={amount}
        onChange={props.onAmount}
      />

      <OverpaymentEffect value={effect} onChange={props.onEffect} />

      <div className="flex justify-end">
        <Button
          disabled={!amount || !fromAccountId}
          loading={props.pending}
          onClick={props.onSubmit}
        >
          Make this payment
        </Button>
      </div>
    </div>
  );
}
