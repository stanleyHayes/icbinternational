import { Injectable } from '@nestjs/common';

import { ErrorCode, type CreateFxAlertRequest, type FxAlert } from '@reliance/contracts';
import { formatRate, rateFromDecimalString } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { toIso } from '../accounts/index.js';

import { FxAlertStore, type FxAlertRecord } from './fx-alert.store.js';
import { rateUnavailable } from './fx-rate.service.js';
import { FX_ALERT_BATCH } from './fx.constants.js';
import { RateAlertNotifierPort } from './rate-alert-notifier.port.js';
import { RateProviderPort } from './rate-feed/rate-provider.port.js';

/** The most alerts one customer may arm at once. */
const MAX_ALERTS_PER_CUSTOMER = 25;

/**
 * Watching a level on the customer's behalf.
 *
 * An alert is armed, evaluated by a job, and fires **once**. It is not a subscription to a
 * rate: a customer who asked to be told when the euro reaches 1.17 does not want to be told
 * again nine minutes later because it wobbled either side of the line. Firing disarms the
 * alert, and re-arming is a deliberate act.
 *
 * Comparison is done on the scaled integer the feed produces, never on a parsed float. A
 * target of `1.17` compared against `1.1699999999999999` would fire a notification the
 * customer cannot reconcile with the board they were looking at.
 */
@Injectable()
export class FxAlertService {
  constructor(
    private readonly alerts: FxAlertStore,
    private readonly rates: RateProviderPort,
    private readonly notifier: RateAlertNotifierPort,
    private readonly clock: ClockService,
  ) {}

  /**
   * Arms an alert.
   *
   * @throws {AppError} `RATE_UNAVAILABLE` when the bank does not quote the pair — there is
   *   no point storing a watch on a level that will never be evaluated.
   * @throws {AppError} `LIMIT_EXCEEDED` past {@link MAX_ALERTS_PER_CUSTOMER}.
   */
  async create(userId: string, request: CreateFxAlertRequest): Promise<FxAlertRecord> {
    const existing = await this.alerts.listByUser(userId);
    if (existing.filter((alert) => alert.active).length >= MAX_ALERTS_PER_CUSTOMER) {
      throw new AppError({
        code: ErrorCode.LIMIT_EXCEEDED,
        message: `You can watch up to ${MAX_ALERTS_PER_CUSTOMER} rates at a time. Remove one to add another.`,
      });
    }

    if (!(await this.rates.midFor(request.from, request.to))) {
      throw rateUnavailable(request.from, request.to);
    }

    return this.alerts.insert({
      userId,
      from: request.from,
      to: request.to,
      direction: request.direction,
      targetRate: request.targetRate,
      createdAt: this.clock.now(),
    });
  }

  async list(userId: string): Promise<readonly FxAlertRecord[]> {
    return this.alerts.listByUser(userId);
  }

  async get(userId: string, id: string): Promise<FxAlertRecord> {
    const alert = await this.alerts.findById(id, userId);
    if (!alert) throw AppError.notFound('That rate alert', id);
    return alert;
  }

  async remove(userId: string, id: string): Promise<FxAlertRecord> {
    const removed = await this.alerts.remove(id, userId);
    if (!removed) throw AppError.notFound('That rate alert', id);
    return removed;
  }

  /**
   * One sweep over every armed alert.
   *
   * Returns how many fired, which is what the job reports and what an operator watches.
   * Rates are fetched per alert rather than per pair: the feed is in-process and cheap,
   * and grouping would trade a real correctness property — every alert evaluated against
   * the same instant it was read at — for an optimisation nothing is asking for.
   */
  async evaluate(): Promise<{ examined: number; triggered: number }> {
    const armed = await this.alerts.listArmed(FX_ALERT_BATCH);
    let triggered = 0;

    for (const alert of armed) {
      if (await this.fireIfCrossed(alert)) triggered += 1;
    }

    return { examined: armed.length, triggered };
  }

  /** Fires one alert if its level has been reached. True when the customer was told. */
  private async fireIfCrossed(alert: FxAlertRecord): Promise<boolean> {
    const quote = await this.rates.midFor(alert.from, alert.to);
    if (!quote || !hasCrossed(alert, quote.rate.value)) return false;

    const fired = await this.alerts.markTriggered(alert.id, quote.asOf);
    if (!fired) return false;

    await this.notifier.notify({
      alert: fired,
      rate: formatRate(quote.rate),
      at: quote.asOf,
    });

    return true;
  }
}

/** Whether the level has been reached, compared on scaled integers. */
export function hasCrossed(alert: FxAlertRecord, current: bigint): boolean {
  const target = rateFromDecimalString(alert.from, alert.to, alert.targetRate).value;
  return alert.direction === 'ABOVE' ? current >= target : current <= target;
}

/** A stored alert, on the wire. */
export function toContractAlert(record: FxAlertRecord): FxAlert {
  return {
    id: record.id,
    from: record.from,
    to: record.to,
    direction: record.direction,
    targetRate: record.targetRate,
    active: record.active,
    triggeredAt: record.triggeredAt ? toIso(record.triggeredAt) : null,
    createdAt: toIso(record.createdAt),
  };
}
