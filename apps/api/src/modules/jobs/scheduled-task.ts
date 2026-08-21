import {
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { ErrorCode } from '@reliance/contracts';

import { type ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';

/** Construction options for a {@link BaseScheduledTask}. */
export interface ScheduledTaskOptions {
  /** Identifies the task in logs. */
  readonly name: string;
  /** How often the task runs, in real milliseconds. */
  readonly intervalMs: number;
}

/**
 * Base class for every recurring job in the platform.
 *
 * A lane subclasses this, implements {@link run}, and registers the subclass as a provider in
 * its own module — nothing else is required for the work to be scheduled:
 *
 * ```ts
 * @Injectable()
 * export class FxAlertTask extends BaseScheduledTask<AlertSweepResult> {
 *   constructor(clock: ClockService, private readonly alerts: FxAlertService) {
 *     super(clock, { name: 'fx.alerts', intervalMs: FX_ALERT_INTERVAL_MS });
 *   }
 *   protected run(): Promise<AlertSweepResult> { return this.alerts.evaluate(); }
 * }
 * ```
 *
 * **What this replaced.** These were BullMQ repeatable jobs on a Redis-backed `scheduler`
 * queue. Redis was removed, so the schedule is now a plain interval in the API process. The
 * consequences are worth stating rather than discovering:
 *
 *  - **No retry or backoff.** A failed pass is logged and the next tick runs the work again.
 *    Every lane's sweep re-reads its due set from MongoDB, so a transient failure is retried
 *    by construction — but a *permanently* failing item is retried forever rather than being
 *    parked after an attempt budget.
 *  - **No dead-letter queue.** The error log is now the only record that a pass failed. There
 *    is no parked payload to inspect and no replay affordance.
 *  - **No cross-process coordination.** Two API instances would each run every task. Sweeps
 *    are idempotent against their own claim state, so that is safe rather than corrupting,
 *    but it is wasted work and the deployment is single-instance for this reason.
 *
 * **The time boundary.** The interval is real wall time; the process cannot schedule against
 * the bank's simulated clock. Business logic inside {@link run} must therefore take "now"
 * exclusively from the injected `ClockService` — advancing the business date a month makes a
 * month of business effects, while the tick still fires every `intervalMs` real milliseconds.
 * This is the same boundary BullMQ imposed, in the same place.
 */
export abstract class BaseScheduledTask<TResult = unknown>
  implements OnApplicationBootstrap, OnModuleDestroy
{
  protected readonly logger = new Logger(this.constructor.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  protected constructor(
    protected readonly clock: ClockService,
    private readonly options: ScheduledTaskOptions,
  ) {}

  /** Performs one pass. Throwing fails the pass — see the class docs for semantics. */
  protected abstract run(): Promise<TResult>;

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.options.intervalMs);
    // Never hold the process open for a tick: shutdown must not wait on the next pass.
    this.timer.unref();
    this.logger.log(`Scheduled ${this.options.name} every ${String(this.options.intervalMs)}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Runs one pass now, outside the schedule.
   *
   * Overlapping passes are skipped rather than queued: a sweep that outruns its interval
   * would otherwise stack up behind a slow database and act on the same due set twice.
   * Returns null when the pass was skipped or failed.
   */
  async runOnce(): Promise<TResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await this.run();
    } catch (error) {
      const failure = asTaskFailure(error);
      this.logger.error(
        `${this.options.name} failed: ${failure.message}; retrying on the next interval`,
        failure.stack,
      );
      return null;
    } finally {
      this.running = false;
    }
  }
}

/** Non-`AppError` throws become a coded failure; the original rides along as `cause`. */
function asTaskFailure(error: unknown): Error {
  if (error instanceof AppError) return error;
  return new AppError({
    code: ErrorCode.INTERNAL_ERROR,
    message: error instanceof Error ? error.message : 'Scheduled task failed without an error message',
    cause: error,
  });
}
