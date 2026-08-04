/**
 * Spending insights: categories, cashflow, subscriptions and budgets.
 *
 * Every proportion crosses the wire as basis points rather than a percentage float, so
 * a category share is exact and a chart cannot render `33.33333333333333%`.
 */

import {
  acknowledgedSchema,
  budgetSchema,
  cashflowSchema,
  paginated,
  resource,
  routes,
  spendByCategorySchema,
  subscriptionSchema,
  type Acknowledged,
  type Budget,
  type Cashflow,
  type CursorQuery,
  type Paginated,
  type Resource,
  type SpendByCategory,
  type Subscription,
  type UpsertBudgetRequest,
} from '@reliance/contracts';

import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const spendResource = resource(spendByCategorySchema);
const cashflowResource = resource(cashflowSchema);
const subscriptionList = paginated(subscriptionSchema);
const budgetList = paginated(budgetSchema);
const budgetResource = resource(budgetSchema);

/**
 * Window and grouping for an insights query.
 *
 * A type alias rather than an interface: only aliases get the implicit index signature
 * that lets them be handed straight to the query serialiser. An interface here compiles
 * to a change at every call site instead of one here.
 */
export type InsightsQuery = {
  readonly accountId?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly currency?: string | undefined;
};

/** An insights window plus the bucket size for the cashflow series. */
export type CashflowQuery = InsightsQuery & {
  readonly granularity?: 'DAY' | 'WEEK' | 'MONTH' | undefined;
};

type BudgetBody = UpsertBudgetRequest;

/** Builds the `client.insights` group. */
export function createInsightsResource(http: HttpTransport) {
  return {
    /** Spend broken down by category, with the change against the previous window. */
    spend: (query?: InsightsQuery, options?: QueryOptions): Promise<Resource<SpendByCategory>> =>
      http.get({ ...options, path: routes.insights.spend, query, schema: spendResource }),

    /** Money in, money out and closing balance per bucket. */
    cashflow: (query?: CashflowQuery, options?: QueryOptions): Promise<Resource<Cashflow>> =>
      http.get({ ...options, path: routes.insights.cashflow, query, schema: cashflowResource }),

    /** Recurring merchants the categoriser has detected. */
    subscriptions: (
      query?: CursorQuery,
      options?: QueryOptions,
    ): Promise<Paginated<Subscription>> =>
      http.get({
        ...options,
        path: routes.insights.subscriptions,
        query,
        schema: subscriptionList,
      }),

    /** The customer's budgets and how far through each one they are. */
    listBudgets: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Budget>> =>
      http.get({ ...options, path: routes.insights.budgets, query, schema: budgetList }),

    /** Creates or replaces the budget for a category. */
    upsertBudget: (body: BudgetBody, options?: MutationOptions): Promise<Resource<Budget>> =>
      http.post({ ...options, path: routes.insights.budgets, body, schema: budgetResource }),

    /** One budget. */
    getBudget: (id: string, options?: QueryOptions): Promise<Resource<Budget>> =>
      http.get({ ...options, path: routes.insights.budget(id), schema: budgetResource }),

    /** Changes a budget's limit or alert threshold. */
    updateBudget: (
      id: string,
      body: Partial<BudgetBody>,
      options?: MutationOptions,
    ): Promise<Resource<Budget>> =>
      http.patch({ ...options, path: routes.insights.budget(id), body, schema: budgetResource }),

    /** Removes a budget. */
    deleteBudget: (id: string, options?: MutationOptions): Promise<Acknowledged> =>
      http.delete({ ...options, path: routes.insights.budget(id), schema: acknowledgedSchema }),
  };
}

/** The `client.insights` group. */
export type InsightsResource = ReturnType<typeof createInsightsResource>;
