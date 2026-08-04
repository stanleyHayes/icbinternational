'use client';

/**
 * What the home screen reads.
 *
 * Each panel owns its own query rather than one call fetching everything, so a slow subscription
 * lookup cannot hold up the balance. They run in parallel and each panel resolves on its own,
 * inside space that was already reserved for it.
 *
 * Keys are declared here because `lib/query-keys.ts` belongs to the shell lane and has no
 * vocabulary for standing orders or goals yet. They are namespaced so a future move is a rename.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  MandateStatus,
  TransferOrderStatus,
  type Goal,
  type Mandate,
  type Money,
  type Notification,
  type TransferOrder,
} from '@reliance/contracts';

import { browserApi } from '@/lib/api';
import { nowMs } from '@/lib/clock';

/** Cache keys for the home screen's own reads. */
export const homeKeys = {
  all: ['home'] as const,
  commitments: () => [...homeKeys.all, 'commitments'] as const,
  goals: () => [...homeKeys.all, 'goals'] as const,
  alerts: () => [...homeKeys.all, 'alerts'] as const,
};

/** Short lists; a single page holds them. */
const LIST_PAGE_SIZE = 25;

/** How far ahead "upcoming" reaches. A month is the horizon people budget against. */
const HORIZON_DAYS = 32;
const MS_PER_DAY = 86_400_000;

/** Alerts shown on the home screen before the customer is sent to the full list. */
const ALERT_LIMIT = 4;

/** Goals shown on the home screen. */
export const GOAL_LIMIT = 3;

/** A payment the customer has already committed to. */
export interface Commitment {
  readonly id: string;
  readonly name: string;
  /** Null for a variable Direct Debit — a water bill is not knowable in advance. */
  readonly amount: Money | null;
  readonly dueAt: string;
  /** "Standing order" or "Direct Debit", in the words on a statement. */
  readonly kind: string;
}

const STANDING_ORDER = 'Standing order';
const DIRECT_DEBIT = 'Direct Debit';

function fromOrders(orders: readonly TransferOrder[]): readonly Commitment[] {
  return orders
    .filter((order) => order.status === TransferOrderStatus.ACTIVE && order.nextRunAt !== null)
    .map((order) => ({
      id: order.id,
      name: order.name,
      amount: order.amount,
      dueAt: order.nextRunAt ?? '',
      kind: STANDING_ORDER,
    }));
}

function fromMandates(mandates: readonly Mandate[]): readonly Commitment[] {
  return mandates
    .filter((mandate) => mandate.status === MandateStatus.ACTIVE && mandate.nextExpectedAt !== null)
    .map((mandate) => ({
      id: mandate.id,
      name: mandate.merchantName,
      amount: mandate.fixedAmount,
      dueAt: mandate.nextExpectedAt ?? '',
      kind: DIRECT_DEBIT,
    }));
}

/**
 * Standing orders and Direct Debits due in the next month, soonest first.
 *
 * Two endpoints because they are two different instruments: a standing order is an instruction
 * the customer gave us, a Direct Debit is an authority they gave someone else. They are shown
 * together because from the customer's side both are money that is about to leave.
 */
export function useCommitments() {
  const query = useQuery({
    queryKey: homeKeys.commitments(),
    queryFn: async () => {
      const api = browserApi();
      const [orders, mandates] = await Promise.all([
        api.transferOrders.list({ limit: LIST_PAGE_SIZE }),
        api.payments.listMandates({ limit: LIST_PAGE_SIZE }),
      ]);
      return [...fromOrders(orders.data), ...fromMandates(mandates.data)];
    },
  });

  const upcoming = useMemo(() => {
    const horizon = new Date(nowMs() + HORIZON_DAYS * MS_PER_DAY).toISOString();
    return (query.data ?? [])
      .filter((commitment) => commitment.dueAt <= horizon)
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  }, [query.data]);

  return { ...query, upcoming };
}

/** The customer's savings goals, closest to completion first. */
export function useGoals() {
  return useQuery({
    queryKey: homeKeys.goals(),
    queryFn: async (): Promise<readonly Goal[]> => {
      const { data } = await browserApi().save.listGoals({ limit: LIST_PAGE_SIZE });
      return [...data]
        .filter((goal) => goal.completedAt === null)
        .sort((left, right) => right.progressBps - left.progressBps);
    },
  });
}

/** Unread notifications, most recent first. */
export function useAlerts() {
  return useQuery({
    queryKey: homeKeys.alerts(),
    queryFn: async (): Promise<readonly Notification[]> =>
      (await browserApi().notifications.list({ unreadOnly: true, limit: ALERT_LIMIT })).data,
  });
}
