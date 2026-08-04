/**
 * Savings goal and term-deposit handlers.
 *
 * Contributing to a goal moves money out of the linked account and into the goal, and
 * both figures change in the same call. A mock that only advanced the goal would let a
 * lane ship a screen where saving £50 costs nothing.
 */

import {
  DepositStatus,
  EntryType,
  ErrorCode,
  routes,
  TransactionDirection,
  type Account,
  type Deposit,
  type Goal,
  type Money,
} from '@reliance/contracts';

import { findAccount, hasInsufficientFunds, postToAccount } from '../db/ledger.js';
import { addMoney, applyBps, minorUnits, money, subtractMoney, zero } from '../db/money.js';
import type { MockDatabase } from '../db/types.js';
import { makeDeposit, makeGoal } from '../factories/products.js';
import { mockId } from '../faker.js';

import {
  failure,
  MockMethod,
  notFound,
  resourceCreated,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate, paginateStatic } from './paging.js';
import { readMoney } from './read-body.js';

const BREAK_PENALTY_BPS = 9_000;
const BPS = 10_000;

function withProgress(goal: Goal, currentAmount: Money): Goal {
  const target = minorUnits(goal.targetAmount);
  const progressBps =
    target === 0n ? 0 : Number((minorUnits(currentAmount) * BigInt(BPS)) / target);
  return { ...goal, currentAmount, progressBps: Math.min(progressBps, BPS) };
}

/** Savings goals and term deposits. */
export const saveHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.save.depositRates, ({ db }) => paginateStatic(db.depositRates)),

  route(MockMethod.GET, routes.save.goals, ({ db, query }) => paginate(db.goals, query)),

  route(MockMethod.POST, routes.save.goals, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const goal = makeGoal({
      clock: db.clock,
      linkedAccountId: String(input.linkedAccountId ?? ''),
      overrides: {
        id: mockId('gol'),
        name: typeof input.name === 'string' ? input.name : 'New goal',
        emoji: typeof input.emoji === 'string' ? input.emoji : null,
        targetAmount: readMoney(body, 'targetAmount') ?? money(100_000),
        currentAmount: zero(),
        progressBps: 0,
        onTrack: true,
        roundUpsEnabled: input.roundUpsEnabled === true,
        createdAt: db.clock.nowIso(),
        completedAt: null,
      },
    });
    db.goals.unshift(goal);
    return resourceCreated(goal);
  }),

  route(MockMethod.POST, routes.save.contribute(':id'), ({ body, db, params }) =>
    moveGoalFunds(db, params.id, body, 'IN'),
  ),

  route(MockMethod.POST, routes.save.withdraw(':id'), ({ body, db, params }) =>
    moveGoalFunds(db, params.id, body, 'OUT'),
  ),

  route(MockMethod.GET, routes.save.goal(':id'), ({ db, params }) => {
    const goal = db.goals.find((candidate) => candidate.id === params.id);
    return goal ? resourceOk(goal) : notFound('That goal');
  }),

  route(MockMethod.PATCH, routes.save.goal(':id'), ({ body, db, params }) => {
    const index = db.goals.findIndex((candidate) => candidate.id === params.id);
    const goal = db.goals[index];
    if (index === -1 || !goal) return notFound('That goal');
    const updated = { ...goal, ...(body as Partial<Goal>) };
    db.goals[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.DELETE, routes.save.goal(':id'), ({ db, params }) => {
    const index = db.goals.findIndex((candidate) => candidate.id === params.id);
    const goal = db.goals[index];
    if (index === -1 || !goal) return notFound('That goal');

    // The balance goes home rather than evaporating: deleting a goal is not a way to
    // lose money, and a mock that dropped it would hide that from the UI.
    if (minorUnits(goal.currentAmount) > 0n) {
      postToAccount(db, {
        accountId: goal.linkedAccountId,
        amount: goal.currentAmount,
        direction: TransactionDirection.CREDIT,
        type: EntryType.GOAL_CONTRIBUTION,
        description: `Closed goal: ${goal.name}`,
      });
    }

    db.goals.splice(index, 1);
    return resourceOk(goal);
  }),

  route(MockMethod.GET, routes.save.deposits, ({ db, query }) => {
    const status = query.get('status');
    return paginate(
      db.deposits.filter((deposit) => !status || deposit.status === status),
      query,
    );
  }),

  route(MockMethod.POST, routes.save.deposits, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const account = findAccount(db, String(input.sourceAccountId ?? ''));
    if (!account) return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');

    const principal = readMoney(body, 'amount') ?? zero(account.currency);
    if (hasInsufficientFunds(account, principal)) {
      return failure(ErrorCode.INSUFFICIENT_FUNDS, 'There is not enough to place this deposit.');
    }

    postToAccount(db, {
      accountId: account.id,
      amount: principal,
      direction: TransactionDirection.DEBIT,
      type: EntryType.DEPOSIT_PLACEMENT,
      description: 'Term deposit placed',
    });

    const termMonths = Number(input.termMonths ?? 12);
    const rate = db.depositRates.find((candidate) => candidate.termMonths === termMonths);
    const annualRateBps = rate?.annualRateBps ?? 455;
    const projectedInterest = applyBps(principal, annualRateBps);

    const deposit = makeDeposit({
      clock: db.clock,
      sourceAccountId: account.id,
      overrides: {
        id: mockId('dep'),
        principal,
        annualRateBps,
        termMonths,
        interestAccrued: zero(account.currency),
        projectedInterest,
        maturityValue: addMoney(principal, projectedInterest),
        autoRollover: input.autoRollover === true,
        placedAt: db.clock.nowIso(),
        maturesOn: db.clock.dateDaysAhead(termMonths * 30),
      },
    });

    db.deposits.unshift(deposit);
    return resourceCreated(deposit);
  }),

  route(MockMethod.GET, routes.save.breakQuote(':id'), ({ db, params }) => {
    const deposit = db.deposits.find((candidate) => candidate.id === params.id);
    if (!deposit) return notFound('That deposit');

    const penalty = applyBps(deposit.interestAccrued, BREAK_PENALTY_BPS);
    return resourceOk({
      principal: deposit.principal,
      interestEarned: deposit.interestAccrued,
      penaltyRateBps: BREAK_PENALTY_BPS,
      penaltyAmount: penalty,
      netProceeds: subtractMoney(addMoney(deposit.principal, deposit.interestAccrued), penalty),
    });
  }),

  route(MockMethod.POST, routes.save.break(':id'), ({ db, params }) => {
    const index = db.deposits.findIndex((candidate) => candidate.id === params.id);
    const deposit = db.deposits[index];
    if (index === -1 || !deposit) return notFound('That deposit');

    if (deposit.status === DepositStatus.BROKEN) {
      return failure(ErrorCode.DEPOSIT_ALREADY_BROKEN, 'This deposit has already been broken.');
    }

    const penalty = applyBps(deposit.interestAccrued, BREAK_PENALTY_BPS);
    const proceeds = subtractMoney(addMoney(deposit.principal, deposit.interestAccrued), penalty);

    postToAccount(db, {
      accountId: deposit.sourceAccountId,
      amount: proceeds,
      direction: TransactionDirection.CREDIT,
      type: EntryType.DEPOSIT_MATURITY,
      description: 'Term deposit broken early',
    });

    const broken: Deposit = {
      ...deposit,
      status: DepositStatus.BROKEN,
      brokenAt: db.clock.nowIso(),
    };
    db.deposits[index] = broken;
    return resourceOk(broken);
  }),

  route(MockMethod.GET, routes.save.deposit(':id'), ({ db, params }) => {
    const deposit = db.deposits.find((candidate) => candidate.id === params.id);
    return deposit ? resourceOk(deposit) : notFound('That deposit');
  }),
];

/** Which way money is travelling between an account and a goal. */
type GoalDirection = 'IN' | 'OUT';

/**
 * Moves money between the linked account and the goal.
 *
 * Both sides change in one call, which is the property a savings screen depends on:
 * putting £50 into a goal has to cost £50, or the UI learns that saving is free.
 */
function moveGoalFunds(
  db: MockDatabase,
  goalId: string | undefined,
  body: unknown,
  direction: GoalDirection,
) {
  const index = db.goals.findIndex((candidate) => candidate.id === goalId);
  const goal = db.goals[index];
  if (index === -1 || !goal) return notFound('That goal');

  const account = findAccount(db, goal.linkedAccountId);
  if (!account) return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'The linked account was not found.');

  const amount = readMoney(body, 'amount') ?? zero();
  const shortfall = goalShortfall({ account, goal, amount, direction });
  if (shortfall) return shortfall;

  postToAccount(db, {
    accountId: account.id,
    amount,
    direction: direction === 'IN' ? TransactionDirection.DEBIT : TransactionDirection.CREDIT,
    type: EntryType.GOAL_CONTRIBUTION,
    description: goal.name,
  });

  const nextAmount =
    direction === 'IN'
      ? addMoney(goal.currentAmount, amount)
      : subtractMoney(goal.currentAmount, amount);

  const updated = withProgress(goal, nextAmount);
  db.goals[index] = updated;
  return resourceOk(updated);
}

interface ShortfallInput {
  readonly account: Account;
  readonly goal: Goal;
  readonly amount: Money;
  readonly direction: GoalDirection;
}

/** The failure for an unaffordable move, or `null` when the move is fine. */
function goalShortfall({ account, amount, direction, goal }: ShortfallInput) {
  if (direction === 'IN') {
    return hasInsufficientFunds(account, amount)
      ? failure(ErrorCode.INSUFFICIENT_FUNDS, 'There is not enough to put into this goal.')
      : null;
  }

  return minorUnits(goal.currentAmount) < minorUnits(amount)
    ? failure(ErrorCode.INSUFFICIENT_FUNDS, 'This goal does not hold that much.')
    : null;
}
