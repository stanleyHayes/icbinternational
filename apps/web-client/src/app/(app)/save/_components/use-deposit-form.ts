'use client';

/**
 * The state behind opening a fixed deposit.
 *
 * The rate board is fetched here rather than in the form, because the term picker cannot be
 * rendered without it and the submit needs the same list to be honest about what was chosen.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useState } from 'react';

import type { Account, CreateDepositRequest, Deposit, DepositRate } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';

const DEFAULT_CURRENCY: CurrencyCode = 'GBP';

/** Everything the deposit form edits. */
export interface DepositDraft {
  readonly sourceAccountId: string;
  readonly amount: string;
  readonly termMonths: string;
  readonly autoRollover: boolean;
}

const EMPTY: DepositDraft = {
  sourceAccountId: '',
  amount: '',
  termMonths: '',
  autoRollover: false,
};

/** What {@link useDepositForm} hands the form. */
export interface DepositForm {
  readonly draft: DepositDraft;
  readonly patch: (patch: Partial<DepositDraft>) => void;
  readonly rates: UseQueryResult<DepositRate[]>;
  readonly source: Account | undefined;
  readonly currency: CurrencyCode;
  readonly ready: boolean;
  readonly create: UseMutationResult<Deposit, unknown, CreateDepositRequest>;
  readonly submit: () => void;
}

/**
 * @param accounts the accounts a deposit can be funded from.
 * @param onCreated where to go once the deposit exists.
 */
export function useDepositForm(
  accounts: readonly Account[] | undefined,
  onCreated: (deposit: Deposit) => void,
): DepositForm {
  const cache = useQueryClient();
  const [draft, setDraft] = useState<DepositDraft>(EMPTY);

  const rates = useQuery({
    queryKey: movementKeys.save.depositRates(DEFAULT_CURRENCY),
    queryFn: async () =>
      (await browserApi().save.depositRates({ currency: DEFAULT_CURRENCY })).data,
  });

  const create = useMutation({
    mutationFn: async (body: CreateDepositRequest) =>
      (await browserApi().save.createDeposit(body)).data,
    onSuccess: async (deposit) => {
      await cache.invalidateQueries({ queryKey: movementKeys.save.all });
      onCreated(deposit);
    },
  });

  const source = accounts?.find((account) => account.id === draft.sourceAccountId);
  const currency: CurrencyCode = source?.currency ?? DEFAULT_CURRENCY;
  const ready = Boolean(draft.sourceAccountId && draft.amount && draft.termMonths);

  return {
    draft,
    patch: (change) => setDraft((current) => ({ ...current, ...change })),
    rates,
    source,
    currency,
    ready,
    create,
    submit: () => {
      if (ready) create.mutate(toDepositRequest(draft, currency));
    },
  };
}

/**
 * The draft as the platform expects it.
 *
 * The currency is the funding account's: a deposit is money moved out of that account, so
 * that is the unit it is denominated in.
 */
function toDepositRequest(draft: DepositDraft, currency: CurrencyCode): CreateDepositRequest {
  return {
    sourceAccountId: draft.sourceAccountId,
    amount: { amount: draft.amount, currency },
    termMonths: Number(draft.termMonths),
    autoRollover: draft.autoRollover,
  };
}
