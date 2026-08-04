'use client';

/**
 * The state behind setting up a standing order.
 *
 * The schedule fields are conditional on the frequency — a weekly order needs a weekday, a monthly
 * one needs a day of the month, and a one-off needs neither. Keeping every field in one draft and
 * deciding at submit time which of them travel is what stops the form losing what the customer
 * typed when they change their mind about how often it should run.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';

import {
  RecurrenceFrequency,
  type CreateTransferOrderRequest,
  type TransferOrder,
} from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { MONTHLY_LIKE, WEEKLY_LIKE } from './frequency';

/** Everything the standing-order form edits. */
export interface OrderDraft {
  readonly name: string;
  readonly sourceAccountId: string;
  readonly beneficiaryId: string;
  readonly amount: string;
  readonly reference: string;
  readonly frequency: RecurrenceFrequency;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly dayOfMonth: string;
  readonly dayOfWeek: string;
}

const EMPTY_DRAFT: OrderDraft = {
  name: '',
  sourceAccountId: '',
  beneficiaryId: '',
  amount: '',
  reference: '',
  frequency: RecurrenceFrequency.MONTHLY,
  startsOn: '',
  endsOn: '',
  dayOfMonth: '1',
  dayOfWeek: '1',
};

/** What {@link useOrderForm} hands the form. */
export interface OrderForm {
  readonly draft: OrderDraft;
  readonly patch: (patch: Partial<OrderDraft>) => void;
  readonly create: UseMutationResult<TransferOrder, unknown, CreateTransferOrderRequest>;
  readonly ready: boolean;
  readonly submit: (currency: CurrencyCode) => void;
}

/** The schedule fields that travel for the chosen frequency, and no others. */
function scheduleFields(draft: OrderDraft) {
  if (MONTHLY_LIKE.has(draft.frequency)) return { dayOfMonth: Number(draft.dayOfMonth) };
  if (WEEKLY_LIKE.has(draft.frequency)) return { dayOfWeek: Number(draft.dayOfWeek) };
  return {};
}

/** @param onCreated where to go once the standing order exists. */
export function useOrderForm(onCreated: (order: TransferOrder) => void): OrderForm {
  const cache = useQueryClient();
  const [draft, setDraft] = useState<OrderDraft>(EMPTY_DRAFT);

  const create = useMutation({
    mutationFn: async (body: CreateTransferOrderRequest) =>
      (await browserApi().transferOrders.create(body)).data,
    onSuccess: async (order) => {
      await cache.invalidateQueries({ queryKey: movementKeys.transferOrders.all });
      onCreated(order);
    },
  });

  const ready = Boolean(
    draft.name.trim() &&
    draft.sourceAccountId &&
    draft.beneficiaryId &&
    draft.amount &&
    draft.startsOn,
  );

  return {
    draft,
    patch: (change) => setDraft((current) => ({ ...current, ...change })),
    create,
    ready,

    submit: (currency: CurrencyCode) => {
      if (!ready) return;
      create.mutate({
        name: draft.name.trim(),
        sourceAccountId: draft.sourceAccountId,
        beneficiaryId: draft.beneficiaryId,
        amount: { amount: draft.amount, currency },
        frequency: draft.frequency,
        startsOn: draft.startsOn,
        ...scheduleFields(draft),
        ...(draft.reference ? { reference: draft.reference } : {}),
        ...(draft.endsOn ? { endsOn: draft.endsOn } : {}),
      });
    },
  };
}
