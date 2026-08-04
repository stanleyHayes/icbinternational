'use client';

/**
 * One savings goal.
 *
 * Progress, then the two things somebody does about it: move money, or change what they set out to
 * do. Deleting a goal returns its balance to the linked account, which is stated before it happens
 * — a customer who thinks deleting a goal deletes the money will not delete it.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { Goal } from '@reliance/contracts';
import { Button, ProgressRing, Switch } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  ConfirmAction,
  DetailList,
  laneRoutes,
  MoneyCell,
  movementKeys,
  QueryPanel,
  Section,
  type Detail,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

import { GoalMoneyForm } from './goal-money-form';

const DELETE_CONSEQUENCE =
  'The goal disappears and everything saved in it goes back to the account it came from. None of the money is lost.';

/** Props for {@link GoalDetail}. */
export interface GoalDetailProps {
  readonly goalId: string;
}

function goalRows(goal: Goal): Detail[] {
  const monthly = goal.suggestedMonthlyContribution;

  return [
    {
      id: 'saved',
      label: 'Saved so far',
      value: <MoneyCell money={goal.currentAmount} size="lg" srLabel="Saved so far" />,
    },
    {
      id: 'target',
      label: 'Target',
      value: <MoneyCell money={goal.targetAmount} muted srLabel="Target" />,
    },
    {
      id: 'monthly',
      label: 'To hit the date',
      value: monthly ? (
        <MoneyCell money={monthly} muted srLabel="Suggested monthly contribution" />
      ) : (
        'No date set'
      ),
      note: goal.targetDate ? `By ${formatDate(goal.targetDate)}` : undefined,
    },
  ];
}

/** Round-ups and deletion, sharing one cache refresh. */
function useGoalSettings(goal: Goal) {
  const cache = useQueryClient();
  const router = useRouter();

  const refresh = async (): Promise<void> => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: movementKeys.save.all }),
      cache.invalidateQueries({ queryKey: queryKeys.accounts.all }),
    ]);
  };

  const setRoundUps = useMutation({
    mutationFn: async (on: boolean) => {
      await browserApi().save.updateGoal(goal.id, { roundUpsEnabled: on });
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async () => {
      await browserApi().save.deleteGoal(goal.id);
    },
    onSuccess: async () => {
      await refresh();
      router.push(laneRoutes.save.index);
    },
  });

  return { setRoundUps, remove };
}

/** The goal's own settings — round-ups, and removing it. */
function GoalSettings({ goal }: { readonly goal: Goal }) {
  const [confirming, setConfirming] = useState(false);
  const { setRoundUps, remove } = useGoalSettings(goal);

  return (
    <Section title="Goal settings">
      <div className="flex flex-col gap-4">
        <FormAlert error={setRoundUps.error ?? remove.error} />

        <Switch
          checked={goal.roundUpsEnabled}
          disabled={setRoundUps.isPending}
          description="Every card payment is rounded up to the nearest pound and the difference comes here."
          onChange={(event) => setRoundUps.mutate(event.target.checked)}
        >
          {goal.roundUpsEnabled ? 'Round-ups on' : 'Round-ups off'}
        </Switch>

        <div>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Delete this goal
          </Button>
        </div>

        <ConfirmAction
          open={confirming}
          onClose={() => setConfirming(false)}
          title={`Delete ${goal.name}`}
          consequence={DELETE_CONSEQUENCE}
          confirmLabel="Delete goal"
          destructive
          onConfirm={() => remove.mutateAsync()}
        />
      </div>
    </Section>
  );
}

function DetailBody({ goal }: { readonly goal: Goal }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <Section
        title={goal.name}
        description={goal.onTrack ? 'On track' : 'Behind where you planned'}
      >
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <ProgressRing
            label={goal.name}
            saved={goal.currentAmount.amount}
            target={goal.targetAmount.amount}
            currency={goal.targetAmount.currency}
          />
          <div className="min-w-0 flex-1">
            <DetailList items={goalRows(goal)} />
          </div>
        </div>
      </Section>

      <div className="flex flex-col gap-6">
        <GoalMoneyForm goal={goal} />
        <GoalSettings goal={goal} />
      </div>
    </div>
  );
}

/**
 * @example <GoalDetail goalId={goalId} />
 */
export function GoalDetail({ goalId }: GoalDetailProps) {
  const goal = useQuery({
    queryKey: movementKeys.save.goal(goalId),
    queryFn: async () => (await browserApi().save.getGoal(goalId)).data,
  });

  return (
    <QueryPanel query={goal} skeletonRows={3}>
      {(data) => <DetailBody goal={data} />}
    </QueryPanel>
  );
}
