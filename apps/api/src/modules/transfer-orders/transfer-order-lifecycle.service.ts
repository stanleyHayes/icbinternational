import { Injectable } from '@nestjs/common';

import { ErrorCode, TransferOrderStatus } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { toStored } from '../../common/money/money.codec.js';
import { fromIsoDate, toIsoDate } from '../loans/index.js';

import { scheduleOf } from './transfer-order.mapper.js';
import {
  assertCurrencyMatches,
  assertEndAfterStart,
  assertLive,
  LIVE_STATUSES,
  requirePayableAmount,
  requireSkippableRun,
  RUNNING_STATUSES,
} from './transfer-order.rules.js';
import { nextRunOn, runFrom } from './transfer-order.schedule.js';
import { TransferOrderService } from './transfer-order.service.js';
import {
  TransferOrderStore,
  type TransferOrderPatchFields,
  type TransferOrderRecord,
} from './transfer-order.store.js';
import {
  type PauseTransferOrderRequest,
  type UpdateTransferOrderRequest,
} from './transfer-orders.dto.js';

/**
 * Pausing, skipping, amending and stopping a standing order.
 *
 * The four verbs are separate because they are four different promises, and collapsing
 * them into one "set the status" would make "just skip this month" and "stop paying my
 * rent" the same gesture.
 *
 * **Pausing keeps the schedule.** `status` alone gates the run sweep, so a paused order
 * holds the date it was heading for and resuming puts it back on its own cadence rather
 * than starting a fresh one from the day the customer pressed resume. Payments that came
 * due while it was paused are not made up: a customer who stopped their rent for three
 * months would not expect three months to leave the account the moment they restart it.
 *
 * **Skipping drops exactly one occurrence.** It moves the next date on by one period and
 * leaves `occurrencesRun` alone, because nothing was paid — an order capped at twelve
 * payments still makes twelve, one period later.
 *
 * Every write goes through the store's conditional patch, so a change that races a
 * cancellation loses to it rather than reviving a schedule the customer had stopped.
 */
@Injectable()
export class TransferOrderLifecycleService {
  constructor(
    private readonly orders: TransferOrderStore,
    private readonly directory: TransferOrderService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Stops or restarts the whole schedule.
   *
   * @throws {AppError} `FEATURE_DISABLED` when a resume date is supplied — see
   *   {@link assertNoResumeDate} — and `CONFLICT` when the order is already finished.
   */
  async setPaused(input: {
    userId: string;
    orderId: string;
    request: PauseTransferOrderRequest;
  }): Promise<TransferOrderRecord> {
    assertNoResumeDate(input.request);
    const order = await this.directory.get(input.userId, input.orderId);
    assertLive(order);

    return input.request.paused ? this.pause(order) : this.resume(order);
  }

  /** Drops the next payment and leaves the schedule running. */
  async skipNext(input: { userId: string; orderId: string }): Promise<TransferOrderRecord> {
    const order = await this.directory.get(input.userId, input.orderId);

    const skipped = toIsoDate(requireSkippableRun(order));
    const next = nextRunOn(scheduleOf(order), {
      after: skipped,
      occurrencesRun: order.occurrencesRun,
    });

    return this.apply(order, RUNNING_STATUSES, scheduleFields(next));
  }

  /**
   * Stops the standing order for good.
   *
   * Idempotent: an order that is already stopped, or that has finished paying, is left
   * alone and reported as done. The customer asked for no further payments and there are
   * none, which is not a state worth turning into an error on a second press.
   */
  async cancel(input: { userId: string; orderId: string }): Promise<void> {
    const order = await this.directory.get(input.userId, input.orderId);
    if (!LIVE_STATUSES.includes(order.status)) return;

    // Unlike every other change, a null from the patch is not a conflict here: it means
    // another request stopped the order first, which is the outcome this one asked for.
    await this.orders.patch({
      id: order.id,
      userId: order.userId,
      expectedStatuses: LIVE_STATUSES,
      fields: { status: TransferOrderStatus.CANCELLED, nextRunAt: null },
    });
  }

  /** Changes the amount, name, reference or ending. Never the payee or the cadence. */
  async amend(input: {
    userId: string;
    orderId: string;
    request: UpdateTransferOrderRequest;
  }): Promise<TransferOrderRecord> {
    const order = await this.directory.get(input.userId, input.orderId);
    assertLive(order);

    return this.apply(order, LIVE_STATUSES, this.amendments(order, input.request));
  }

  /** Pausing leaves `nextRunAt` untouched; that is what "the schedule is not lost" means. */
  private async pause(order: TransferOrderRecord): Promise<TransferOrderRecord> {
    if (order.status === TransferOrderStatus.PAUSED) return order;
    return this.apply(order, RUNNING_STATUSES, { status: TransferOrderStatus.PAUSED });
  }

  /** Resuming rejoins the cadence: the booked date if it still lies ahead, else the next one. */
  private async resume(order: TransferOrderRecord): Promise<TransferOrderRecord> {
    if (order.status !== TransferOrderStatus.PAUSED) return order;

    const today = this.clock.today();
    const booked = order.nextRunAt ? toIsoDate(order.nextRunAt) : null;
    const next =
      booked !== null && booked >= today
        ? booked
        : runFrom(scheduleOf(order), { from: today, occurrencesRun: order.occurrencesRun });

    return this.apply(order, [TransferOrderStatus.PAUSED], {
      status: TransferOrderStatus.ACTIVE,
      ...scheduleFields(next),
    });
  }

  /** The amended fields, with the next payment date recomputed against the new ending. */
  private amendments(
    order: TransferOrderRecord,
    request: UpdateTransferOrderRequest,
  ): TransferOrderPatchFields {
    const endsOn = request.endsOn ?? order.endsOn;
    const maxOccurrences = request.maxOccurrences ?? order.maxOccurrences;
    assertEndAfterStart(order.startsOn, endsOn);

    const from = order.nextRunAt ? toIsoDate(order.nextRunAt) : this.clock.today();
    const next = runFrom(scheduleOf(order, { endsOn, maxOccurrences }), {
      from,
      occurrencesRun: order.occurrencesRun,
    });

    return {
      ...(request.name === undefined ? {} : { name: request.name }),
      ...(request.reference === undefined ? {} : { reference: request.reference }),
      ...(request.amount === undefined ? {} : { amount: this.amountFor(order, request.amount) }),
      endsOn,
      maxOccurrences,
      ...scheduleFields(next),
    };
  }

  /** A new amount, in the currency the order already pays in. */
  private amountFor(
    order: TransferOrderRecord,
    amount: NonNullable<UpdateTransferOrderRequest['amount']>,
  ): TransferOrderRecord['amount'] {
    assertCurrencyMatches(amount, order.amount.currency);
    return toStored(requirePayableAmount(amount));
  }

  /**
   * The conditional write, and the one place a lost race is turned into an answer.
   *
   * A null from the store means the order moved between the read and the write — almost
   * always a cancellation landing first. Reporting that as a conflict is more use than
   * retrying into it.
   */
  private async apply(
    order: TransferOrderRecord,
    expectedStatuses: readonly TransferOrderStatus[],
    fields: TransferOrderPatchFields,
  ): Promise<TransferOrderRecord> {
    const updated = await this.orders.patch({
      id: order.id,
      userId: order.userId,
      expectedStatuses,
      fields,
    });

    if (updated) return updated;

    throw AppError.conflict(
      ErrorCode.CONFLICT,
      'This standing order changed while we were updating it. Open it again to see where it stands.',
    );
  }
}

/** A schedule with nothing left to pay is finished, and says so rather than sitting idle. */
function scheduleFields(next: string | null): TransferOrderPatchFields {
  return next === null
    ? { nextRunAt: null, status: TransferOrderStatus.COMPLETED }
    : { nextRunAt: fromIsoDate(next) };
}

/**
 * A pause that resumes itself on a date is refused rather than stored.
 *
 * `resumeOn` is in the contract's request shape, but nothing in the bank acts on it: the
 * lane that would wake a paused order on a date — the same one that would run it — is not
 * built. Storing the date would tell a customer their rent restarts on the 1st and then
 * leave it paused, which is the one failure mode a standing order must not have. Pausing
 * indefinitely and resuming by hand does exactly what it says.
 */
function assertNoResumeDate(request: PauseTransferOrderRequest): void {
  if (request.resumeOn === undefined) return;

  throw new AppError({
    code: ErrorCode.FEATURE_DISABLED,
    message:
      'Pausing until a set date is not available yet. Pause the standing order now and resume it whenever you like.',
    context: { resumeOn: request.resumeOn },
  });
}
