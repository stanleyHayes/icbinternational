/**
 * Savings goals: creating them, changing them, and moving money by hand.
 *
 * The vault movements themselves belong to {@link GoalVaultService}, which is the only
 * thing that writes a vault balance. What is left here is the goal as an object the
 * customer owns: its name, its target, its deadline, and whether it is still open.
 */

import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode, type CreateGoalRequest, type Goal } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { fromStored, fromWire, toStored } from '../../common/money/money.codec.js';
import { TransactionRunner } from '../../database/transaction.runner.js';
import { AccountService } from '../accounts/index.js';

import { nextRunAfter } from './auto-save-schedule.js';
import { GoalVaultService, VaultMovement } from './goal-vault.service.js';
import { GOAL_TRANSACTION_LABEL } from './goal.constants.js';
import { toContractGoal } from './goal.mapper.js';
import { GoalStore, type GoalRecord } from './goal.store.js';
import {
  type ContributeToGoalRequest,
  type SetAutoSaveRequest,
  type UpdateGoalRequest,
  type WithdrawFromGoalRequest,
} from './savings-goals.dto.js';

@Injectable()
export class GoalService {
  private readonly logger = new Logger(GoalService.name);

  constructor(
    private readonly goals: GoalStore,
    private readonly accounts: AccountService,
    private readonly vault: GoalVaultService,
    private readonly runner: TransactionRunner,
    private readonly clock: ClockService,
  ) {}

  /** The customer's open goals, newest first. */
  async list(userId: string): Promise<Goal[]> {
    const records = await this.goals.list({ userId, openOnly: true });
    const asOf = this.clock.today();
    return records.map((record) => toContractGoal(record, asOf));
  }

  /** One goal, resolved through the customer's id. */
  async get(userId: string, goalId: string): Promise<Goal> {
    return toContractGoal(await this.requireOwned(userId, goalId), this.clock.today());
  }

  /**
   * Opens a goal.
   *
   * Starts empty. Funding it is a separate, explicit act, because a goal that quietly took
   * money the moment it was created would be a transfer disguised as a form.
   */
  async create(userId: string, request: CreateGoalRequest): Promise<Goal> {
    const account = await this.accounts.requireOwned({
      userId,
      accountId: request.linkedAccountId,
    });
    const target = fromWire(request.targetAmount);
    this.assertSameCurrency(target, account.currency);

    const today = this.clock.today();
    const goal = await this.goals.insert({
      userId,
      name: request.name,
      emoji: request.emoji ?? null,
      targetAmount: toStored(target),
      currentAmount: toStored(Money.zero(target.currency)),
      targetDate: request.targetDate ?? null,
      linkedAccountId: account.id,
      roundUpsEnabled: request.roundUpsEnabled,
      autoSave: null,
      startedOn: today,
      completedAt: null,
      closedAt: null,
      createdAt: this.clock.now(),
      movementCount: 0,
    });

    this.logger.log(`Savings goal ${goal.id} opened`);
    return toContractGoal(goal, today);
  }

  /** Edits a goal. Anything omitted is left as it was. */
  async update(input: {
    userId: string;
    goalId: string;
    request: UpdateGoalRequest;
  }): Promise<Goal> {
    const goal = await this.requireOwned(input.userId, input.goalId);
    const { request } = input;

    const updated = await this.goals.patch(goal.id, {
      name: request.name,
      emoji: request.emoji,
      targetAmount: request.targetAmount ? toStored(fromWire(request.targetAmount)) : undefined,
      targetDate: request.targetDate,
      roundUpsEnabled: request.roundUpsEnabled,
    });

    return toContractGoal(updated ?? goal, this.clock.today());
  }

  /** Moves money from the linked account into the goal. */
  async contribute(input: {
    userId: string;
    goalId: string;
    request: ContributeToGoalRequest;
  }): Promise<Goal> {
    const goal = await this.requireOwned(input.userId, input.goalId);
    const amount = fromWire(input.request.amount);
    this.assertSameCurrency(amount, fromStored(goal.targetAmount).currency);

    const updated = await this.vault.credit({
      goalId: goal.id,
      amount,
      movement: VaultMovement.CONTRIBUTION,
    });
    return toContractGoal(updated, this.clock.today());
  }

  /** Moves money back from the goal to the linked account. */
  async withdraw(input: {
    userId: string;
    goalId: string;
    request: WithdrawFromGoalRequest;
  }): Promise<Goal> {
    const goal = await this.requireOwned(input.userId, input.goalId);
    const amount = fromWire(input.request.amount);
    this.assertSameCurrency(amount, fromStored(goal.targetAmount).currency);

    const updated = await this.vault.debit({ goalId: goal.id, amount });
    return toContractGoal(updated, this.clock.today());
  }

  /**
   * Sets up, changes or cancels an automatic contribution.
   *
   * A null request cancels. The first run defaults to one period from today rather than
   * today, so setting up a monthly save does not take money the same minute — a customer
   * who has just chosen "£50 a month" has not agreed to £50 right now.
   */
  async setAutoSave(input: {
    userId: string;
    goalId: string;
    request: SetAutoSaveRequest;
  }): Promise<Goal> {
    const goal = await this.requireOwned(input.userId, input.goalId);
    const today = this.clock.today();

    if (!input.request) {
      const cleared = await this.goals.patch(goal.id, { autoSave: null });
      return toContractGoal(cleared ?? goal, today);
    }

    const amount = fromWire(input.request.amount);
    this.assertSameCurrency(amount, fromStored(goal.targetAmount).currency);

    const updated = await this.goals.patch(goal.id, {
      autoSave: {
        amount: toStored(amount),
        frequency: input.request.frequency,
        nextRunOn: input.request.startsOn ?? nextRunAfter(today, input.request.frequency),
      },
    });

    return toContractGoal(updated ?? goal, today);
  }

  /**
   * Closes a goal, returning whatever is in the vault first.
   *
   * The money always comes back. There is no state in which closing a goal leaves a
   * balance stranded in a vault nothing points at any more — the emptying and the closing
   * are one transaction, so a contribution that lands mid-close either goes back to the
   * customer with the rest or is refused, never left behind an inaccessible goal.
   */
  async close(userId: string, goalId: string): Promise<Goal> {
    const goal = await this.requireOwned(userId, goalId);

    const closed = await this.runner.run(
      async (session) => {
        const emptied = await this.vault.drain({ goalId: goal.id, session });
        const patched = await this.goals.patch(
          emptied.id,
          { closedAt: this.clock.now(), autoSave: null, roundUpsEnabled: false },
          session,
        );
        return patched ?? emptied;
      },
      { label: GOAL_TRANSACTION_LABEL.CLOSE },
    );

    this.logger.log(`Savings goal ${goal.id} closed`);
    return toContractGoal(closed, this.clock.today());
  }

  /**
   * Resolves a goal the customer owns.
   *
   * @throws {AppError} `NOT_FOUND` whether the goal is missing or somebody else's.
   */
  async requireOwned(userId: string, goalId: string): Promise<GoalRecord> {
    const goal = await this.goals.findById(goalId);
    if (!goal || goal.userId !== userId || goal.closedAt !== null) throw goalNotFound(goalId);
    return goal;
  }

  /** @throws {AppError} `VALIDATION_FAILED` on a currency the goal is not held in. */
  private assertSameCurrency(amount: Money, expected: string): void {
    if (amount.currency === expected) return;

    throw new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message: `This goal is held in ${expected}. Amounts have to be in ${expected} too.`,
      context: { expected, supplied: amount.currency },
    });
  }
}

/** The one "no such goal" error, so every path answers a stranger the same way. */
export function goalNotFound(goalId: string): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: 'We could not find that savings goal.',
    context: { goalId },
  });
}
