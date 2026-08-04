'use client';

/**
 * The state behind starting a goal.
 *
 * Separated from the markup so the form reads as a description of the screen. The currency follows
 * the linked account rather than being asked for: a goal saves into an account, and the account
 * already has a currency.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { Account, CreateGoalRequest, Goal } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';

/** Everything the goal form edits. */
export interface GoalDraft {
  readonly name: string;
  readonly target: string;
  readonly targetDate: string;
  readonly linkedAccountId: string;
  readonly roundUps: boolean;
}

const EMPTY: GoalDraft = {
  name: '',
  target: '',
  targetDate: '',
  linkedAccountId: '',
  roundUps: false,
};

/** What {@link useGoalForm} hands the form. */
export interface GoalForm {
  readonly draft: GoalDraft;
  readonly patch: (patch: Partial<GoalDraft>) => void;
  readonly currency: CurrencyCode;
  readonly ready: boolean;
  readonly create: UseMutationResult<Goal, unknown, CreateGoalRequest>;
  readonly submit: () => void;
}

/**
 * @param accounts the accounts a goal can save into.
 * @param onCreated where to go once the goal exists.
 */
export function useGoalForm(
  accounts: readonly Account[] | undefined,
  onCreated: (goal: Goal) => void,
): GoalForm {
  const cache = useQueryClient();
  const [draft, setDraft] = useState<GoalDraft>(EMPTY);

  const create = useMutation({
    mutationFn: async (body: CreateGoalRequest) => (await browserApi().save.createGoal(body)).data,
    onSuccess: async (goal) => {
      await cache.invalidateQueries({ queryKey: movementKeys.save.all });
      onCreated(goal);
    },
  });

  const account = accounts?.find((candidate) => candidate.id === draft.linkedAccountId);
  const currency: CurrencyCode = account?.currency ?? 'GBP';
  const ready = Boolean(draft.name.trim() && draft.target && draft.linkedAccountId);

  return {
    draft,
    patch: (change) => setDraft((current) => ({ ...current, ...change })),
    currency,
    ready,
    create,
    submit: () => {
      if (!ready) return;
      create.mutate({
        name: draft.name.trim(),
        targetAmount: { amount: draft.target, currency },
        linkedAccountId: draft.linkedAccountId,
        roundUpsEnabled: draft.roundUps,
        ...(draft.targetDate ? { targetDate: draft.targetDate } : {}),
      });
    },
  };
}
