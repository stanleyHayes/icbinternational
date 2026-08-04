'use client';

/**
 * Moving money in and out of a goal.
 *
 * One form with two verbs, because they are the same decision from opposite ends and a customer
 * who has just seen "£340 to go" wants to act on it without navigating. Withdrawing is not made
 * awkward on purpose: money in a goal is the customer's money, and a bank that makes it hard to
 * take back is a bank people stop putting money into.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Goal } from '@reliance/contracts';
import { Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  AccountSelect,
  AmountField,
  movementKeys,
  Section,
  useUsableAccounts,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** Which way the money is going. */
type Direction = 'in' | 'out';

/** Props for {@link GoalMoneyForm}. */
export interface GoalMoneyFormProps {
  readonly goal: Goal;
}

/** Contributes to or withdraws from a goal, refreshing the balances either way. */
function useMoveGoalFunds(goal: Goal, direction: Direction) {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      readonly amount: { amount: string; currency: string };
      readonly accountId: string;
    }) => {
      const move = direction === 'in' ? browserApi().save.contribute : browserApi().save.withdraw;
      return (await move(goal.id, body as never)).data;
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: movementKeys.save.all }),
        cache.invalidateQueries({ queryKey: queryKeys.accounts.all }),
      ]);
    },
  });
}

/**
 * @example <GoalMoneyForm goal={goal} />
 */
export function GoalMoneyForm({ goal }: GoalMoneyFormProps) {
  const accounts = useUsableAccounts();
  const [direction, setDirection] = useState<Direction>('in');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(goal.linkedAccountId);
  const move = useMoveGoalFunds(goal, direction);

  const currency = goal.targetAmount.currency;
  const send = (next: Direction): void => {
    setDirection(next);
    if (!amount || !accountId) return;
    move.mutate({ amount: { amount, currency }, accountId });
  };

  return (
    <Section title="Move money" description="Add to this goal, or take some back out.">
      <div className="flex flex-col gap-4">
        <FormAlert error={move.error} />

        <AccountSelect
          label="Account"
          accounts={accounts.data ?? []}
          value={accountId}
          onChange={setAccountId}
        />

        <AmountField label="Amount" currency={currency} value={amount} onChange={setAmount} />

        <MoveButtons disabled={!amount} pending={move.isPending ? direction : null} onMove={send} />
      </div>
    </Section>
  );
}

/** The two verbs, with only the one in flight showing a spinner. */
function MoveButtons({
  disabled,
  pending,
  onMove,
}: {
  readonly disabled: boolean;
  readonly pending: Direction | null;
  readonly onMove: (direction: Direction) => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-3">
      <Button
        variant="secondary"
        disabled={disabled}
        loading={pending === 'out'}
        onClick={() => onMove('out')}
      >
        Take money out
      </Button>
      <Button disabled={disabled} loading={pending === 'in'} onClick={() => onMove('in')}>
        Add to this goal
      </Button>
    </div>
  );
}
