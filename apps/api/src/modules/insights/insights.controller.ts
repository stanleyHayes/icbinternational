import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import {
  routes,
  upsertBudgetRequestSchema,
  type Budget,
  type Cashflow,
  type SpendByCategory,
  type Subscription,
  type UpsertBudgetRequest,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import { BudgetService } from './budget.service.js';
import { CashflowService } from './cashflow.service.js';
import {
  cashflowQuerySchema,
  spendQuerySchema,
  subscriptionQuerySchema,
  type CashflowQueryDto,
  type SpendQueryDto,
  type SubscriptionQueryDto,
} from './insights.dto.js';
import { toPeriod } from './period.js';
import { SpendService } from './spend.service.js';
import { SubscriptionService } from './subscription.service.js';

/**
 * What a customer's own money says about them.
 *
 * Every route is authenticated and every one is scoped to the caller: the services take a
 * `userId` and pass it into the store's filter, so there is no route parameter here that
 * can address another customer's history.
 *
 * Nothing on this controller can move money or change a transaction. The one write is a
 * budget, which is a note to self.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(
    private readonly spend: SpendService,
    private readonly cashflow: CashflowService,
    private readonly subscriptions: SubscriptionService,
    private readonly budgets: BudgetService,
  ) {}

  /** Spend by category over a window, with shares in basis points. */
  @Get(routes.insights.spend)
  spendByCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(spendQuerySchema)) query: SpendQueryDto,
  ): Promise<SpendByCategory> {
    return this.spend.spendByCategory({
      userId: user.userId,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      currency: query.currency,
      period: toPeriod(query.from, query.to),
    });
  }

  /** Money in, money out and the closing balance for each bucket of a window. */
  @Get(routes.insights.cashflow)
  cashflowByBucket(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(cashflowQuerySchema)) query: CashflowQueryDto,
  ): Promise<Cashflow> {
    return this.cashflow.cashflow({
      userId: user.userId,
      accountId: query.accountId,
      currency: query.currency,
      period: toPeriod(query.from, query.to),
      granularity: query.granularity,
    });
  }

  /** Recurring merchant charges detected in the customer's history. */
  @Get(routes.insights.subscriptions)
  listSubscriptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodBody(subscriptionQuerySchema)) query: SubscriptionQueryDto,
  ): Promise<Subscription[]> {
    return this.subscriptions.detect({ userId: user.userId, ...query });
  }

  /** Every budget the customer has set, with this month's utilisation. */
  @Get(routes.insights.budgets)
  listBudgets(@CurrentUser() user: AuthenticatedUser): Promise<Budget[]> {
    return this.budgets.list(user.userId);
  }

  /** Sets or replaces the limit for one category. */
  @Post(routes.insights.budgets)
  upsertBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(upsertBudgetRequestSchema)) body: UpsertBudgetRequest,
  ): Promise<Budget> {
    return this.budgets.upsert(user.userId, body);
  }

  /** Removes a budget. One belonging to someone else answers 404, never 403. */
  @Delete(routes.insights.budget(':id'))
  async removeBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ acknowledged: true }> {
    await this.budgets.remove({ userId: user.userId, budgetId: id });
    return { acknowledged: true };
  }
}
