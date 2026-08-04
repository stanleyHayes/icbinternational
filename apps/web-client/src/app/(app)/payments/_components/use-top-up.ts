'use client';

/**
 * The state behind a phone top-up.
 *
 * Kept apart from the markup so the form is a description of the screen. The currency follows the
 * funding account rather than being asked for, because a top-up is always in the account's own
 * currency.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { Account, BillPayment, CreateTopUpRequest } from '@reliance/contracts';

import { movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** What is being bought. */
export type Bundle = 'AIRTIME' | 'DATA';

/** Everything the top-up form edits. */
export interface TopUpDraft {
  readonly sourceAccountId: string;
  readonly provider: string;
  readonly phone: string;
  readonly bundle: Bundle;
  readonly amount: string;
}

/** What {@link useTopUp} hands the form. */
export interface TopUpForm {
  readonly draft: TopUpDraft;
  readonly patch: (patch: Partial<TopUpDraft>) => void;
  readonly source: Account | undefined;
  readonly ready: boolean;
  readonly topUp: UseMutationResult<BillPayment, unknown, CreateTopUpRequest>;
  readonly submit: () => void;
}

/** @param accounts the accounts a top-up can be funded from. */
export function useTopUp(
  accounts: readonly Account[] | undefined,
  defaultProvider: string,
): TopUpForm {
  const cache = useQueryClient();
  const [draft, setDraft] = useState<TopUpDraft>({
    sourceAccountId: '',
    provider: defaultProvider,
    phone: '',
    bundle: 'AIRTIME',
    amount: '',
  });

  const topUp = useMutation({
    mutationFn: async (body: CreateTopUpRequest) => (await browserApi().payments.topUp(body)).data,
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: movementKeys.payments.all }),
        cache.invalidateQueries({ queryKey: queryKeys.accounts.all }),
      ]);
    },
  });

  const source = accounts?.find((account) => account.id === draft.sourceAccountId);
  const ready = Boolean(draft.sourceAccountId && draft.phone && draft.amount);

  return {
    draft,
    patch: (change) => setDraft((current) => ({ ...current, ...change })),
    source,
    ready,
    topUp,
    submit: () => {
      if (ready) topUp.mutate(toTopUpRequest(draft, source));
    },
  };
}

/**
 * The draft as the platform expects it.
 *
 * The amount takes the funding account's currency: a top-up is debited from that account,
 * so that is the unit the customer is actually spending.
 */
function toTopUpRequest(draft: TopUpDraft, source: Account | undefined): CreateTopUpRequest {
  return {
    provider: draft.provider,
    phone: draft.phone,
    bundle: draft.bundle,
    amount: { amount: draft.amount, currency: source?.currency ?? 'GBP' },
    sourceAccountId: draft.sourceAccountId,
  };
}
