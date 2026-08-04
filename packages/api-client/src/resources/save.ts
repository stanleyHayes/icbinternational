/**
 * Savings goals and term deposits.
 *
 * Breaking a deposit is a two-call flow — `breakQuote` then `break` — for the same
 * reason a transfer is quoted before it executes: the customer must see the penalty in
 * money, not in basis points, before they lose it.
 */

import {
  breakDepositQuoteSchema,
  depositRateSchema,
  depositSchema,
  goalSchema,
  paginated,
  resource,
  routes,
  type BreakDepositQuote,
  type CreateDepositRequest,
  type CreateGoalRequest,
  type CursorQuery,
  type Deposit,
  type DepositRate,
  type DepositStatus,
  type Goal,
  type Paginated,
  type Resource,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../core/idempotency.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const goalList = paginated(goalSchema);
const goalResource = resource(goalSchema);
const depositList = paginated(depositSchema);
const depositResource = resource(depositSchema);
const rateList = paginated(depositRateSchema);
const breakQuoteResource = resource(breakDepositQuoteSchema);

/** Body of a goal contribution or withdrawal. */
export interface MoveGoalFundsRequest {
  readonly amount: { readonly amount: string; readonly currency: string };
  /** Which account the money comes from, or goes back to. */
  readonly accountId: string;
}

/** Body of a goal amendment. */
export type UpdateGoalRequest = Partial<
  Pick<CreateGoalRequest, 'name' | 'emoji' | 'targetAmount' | 'targetDate' | 'roundUpsEnabled'>
>;

/** Filters for the deposit list. */
export type ListDepositsQuery = {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
  readonly status?: DepositStatus | undefined;
};

/** Filters for the deposit rate board. */
export type DepositRatesQuery = {
  readonly currency?: string | undefined;
  readonly termMonths?: number | undefined;
};

/** Builds the `client.save` group. */
export function createSaveResource(http: HttpTransport) {
  return {
    /** The customer's savings goals. */
    listGoals: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Goal>> =>
      http.get({ ...options, path: routes.save.goals, query, schema: goalList }),

    /** Creates a goal. Round-ups, if enabled, start on the next card purchase. */
    createGoal: (body: CreateGoalRequest, options?: MutationOptions): Promise<Resource<Goal>> =>
      http.post({ ...options, path: routes.save.goals, body, schema: goalResource }),

    /** One goal, with progress and whether it is on track for its date. */
    getGoal: (id: string, options?: QueryOptions): Promise<Resource<Goal>> =>
      http.get({ ...options, path: routes.save.goal(id), schema: goalResource }),

    /** Amends a goal. */
    updateGoal: (
      id: string,
      body: UpdateGoalRequest,
      options?: MutationOptions,
    ): Promise<Resource<Goal>> =>
      http.patch({ ...options, path: routes.save.goal(id), body, schema: goalResource }),

    /** Deletes a goal, returning any balance to the linked account. */
    deleteGoal: (id: string, options?: MutationOptions): Promise<Resource<Goal>> =>
      http.delete({ ...options, path: routes.save.goal(id), schema: goalResource }),

    /** Moves money into a goal. */
    contribute: (
      id: string,
      body: MoveGoalFundsRequest,
      options?: MutationOptions,
    ): Promise<Resource<Goal>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.save.contribute(id),
        body,
        schema: goalResource,
      }),

    /** Takes money back out of a goal. */
    withdraw: (
      id: string,
      body: MoveGoalFundsRequest,
      options?: MutationOptions,
    ): Promise<Resource<Goal>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.save.withdraw(id),
        body,
        schema: goalResource,
      }),

    /** The term-deposit rate board. */
    depositRates: (
      query?: DepositRatesQuery,
      options?: QueryOptions,
    ): Promise<Paginated<DepositRate>> =>
      http.get({ ...options, path: routes.save.depositRates, query, schema: rateList }),

    /** The customer's term deposits. */
    listDeposits: (
      query?: ListDepositsQuery,
      options?: QueryOptions,
    ): Promise<Paginated<Deposit>> =>
      http.get({ ...options, path: routes.save.deposits, query, schema: depositList }),

    /** Places a term deposit, moving the principal out of the source account. */
    createDeposit: (
      body: CreateDepositRequest,
      options?: MutationOptions,
    ): Promise<Resource<Deposit>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.save.deposits,
        body,
        schema: depositResource,
      }),

    /** One deposit, with interest accrued so far and its maturity value. */
    getDeposit: (id: string, options?: QueryOptions): Promise<Resource<Deposit>> =>
      http.get({ ...options, path: routes.save.deposit(id), schema: depositResource }),

    /** What breaking a deposit early would cost, in money. Read-only. */
    breakQuote: (id: string, options?: QueryOptions): Promise<Resource<BreakDepositQuote>> =>
      http.get({ ...options, path: routes.save.breakQuote(id), schema: breakQuoteResource }),

    /** Breaks a deposit early, applying the penalty the quote disclosed. */
    break: (id: string, options?: MutationOptions): Promise<Resource<Deposit>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.save.break(id),
        schema: depositResource,
      }),
  };
}

/** The `client.save` group. */
export type SaveResource = ReturnType<typeof createSaveResource>;
