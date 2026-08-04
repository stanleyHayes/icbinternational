/**
 * The two things that save money without the customer doing anything.
 *
 * Round-ups react to card spend; auto-saves run on a schedule. Both are driven by the
 * business date, so advancing the simulated clock a year produces a year of automatic
 * saving rather than one run — {@link dueRuns} counts the missed occurrences instead of
 * assuming a job saw every day.
 */

import { Injectable, Logger } from '@nestjs/common';

import { Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored, fromWire } from '../../common/money/money.codec.js';

import { dueRuns, nextRunAfter, type AutoSaveFrequency } from './auto-save-schedule.js';
import { GoalVaultService, VaultMovement } from './goal-vault.service.js';
import { AUTOMATION_BATCH_SIZE } from './goal.constants.js';
import { GoalStore, type GoalRecord } from './goal.store.js';
import { roundUpFor } from './round-up.js';
import { type ApplyRoundUpsRequest } from './savings-goals.dto.js';

/** The most missed occurrences one catch-up will process for a single goal. */
const MAX_CATCH_UP_RUNS = 120;

@Injectable()
export class GoalAutomationService {
  private readonly logger = new Logger(GoalAutomationService.name);

  constructor(
    private readonly goals: GoalStore,
    private readonly vault: GoalVaultService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Applies round-ups from a batch of card spend on one account.
   *
   * The change goes to the oldest open goal with round-ups switched on. Splitting forty
   * pence across three goals would produce amounts too small to be worth a ledger entry,
   * and a customer who wants two goals funded can set an auto-save on the second.
   *
   * @returns The total moved, which the caller reports back to the customer.
   */
  async applyRoundUps(request: ApplyRoundUpsRequest): Promise<Money> {
    const targets = await this.goals.listRoundUpTargets(request.accountId);
    const spends = request.spends.map((spend) => fromWire(spend));
    const currency = spends[0]?.currency;
    const target = targets[0];

    if (!target || !currency) return Money.zero(currency ?? 'GBP');

    const change = spends.reduce(
      (total, spend) => total.plus(roundUpFor(spend)),
      Money.zero(currency),
    );
    if (!change.isPositive) return change;

    await this.vault.credit({
      goalId: target.id,
      amount: change,
      movement: VaultMovement.ROUND_UP,
    });
    this.logger.log(`Round-ups of ${change.toString()} applied to goal ${target.id}`);

    return change;
  }

  /**
   * Runs every auto-save that is due.
   *
   * @returns How many goals were funded, which is what the job's metrics record.
   */
  async runAutoSaves(): Promise<number> {
    const asOf = this.clock.today();
    const due = await this.goals.listAutoSaveDue({ asOf, limit: AUTOMATION_BATCH_SIZE });

    for (const goal of due) {
      await this.runOne(goal, asOf);
    }

    return due.length;
  }

  /**
   * Runs one goal's auto-save, catching up any occurrences that were missed.
   *
   * Each occurrence is a separate movement rather than one combined amount, so the
   * customer's statement shows the same number of lines whether the clock moved a day at a
   * time or a year at once.
   */
  async runOne(goal: GoalRecord, asOf: string): Promise<GoalRecord> {
    const schedule = goal.autoSave;
    if (!schedule) return goal;

    const amount = fromStored(schedule.amount);
    const occurrences = dueRuns({
      nextRunOn: schedule.nextRunOn,
      asOf,
      frequency: schedule.frequency,
      cap: MAX_CATCH_UP_RUNS,
    });

    // Each occurrence is its own vault movement, and each one re-reads the goal inside its
    // own transaction — so a catch-up of fifty weekly saves is fifty entries against fifty
    // successive balances, not fifty writes derived from the balance this loop started on.
    let current = goal;
    for (const runOn of occurrences) {
      this.logger.debug(`Auto-saving ${amount.toString()} into goal ${goal.id} for ${runOn}`);
      current = await this.vault.credit({
        goalId: goal.id,
        amount,
        movement: VaultMovement.AUTO_SAVE,
      });
    }

    return this.reschedule(current, occurrences.at(-1) ?? schedule.nextRunOn, schedule.frequency);
  }

  /** Advances the schedule past the last occurrence that ran. */
  private async reschedule(
    goal: GoalRecord,
    lastRunOn: string,
    frequency: AutoSaveFrequency,
  ): Promise<GoalRecord> {
    if (!goal.autoSave) return goal;

    const updated = await this.goals.patch(goal.id, {
      autoSave: { ...goal.autoSave, nextRunOn: nextRunAfter(lastRunOn, frequency) },
    });
    return updated ?? goal;
  }
}
