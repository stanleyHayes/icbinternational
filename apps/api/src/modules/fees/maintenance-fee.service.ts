import { Injectable, Logger } from '@nestjs/common';

import { FeeKind } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored } from '../../common/money/money.codec.js';

import { ChargeableAccountReader, type ChargeableAccount } from './chargeable-account.reader.js';
import { FeeChargingService } from './fee-charging.service.js';
import { FeeChargeSource, SWEEP_BATCH_SIZE, scheduledChargeKey } from './fees.constants.js';
import { activeDaysWithin, monthPeriodBefore, type MonthPeriod } from './maintenance-period.js';

/** What one maintenance sweep did, returned as the job's result. */
export interface MaintenanceSweepResult {
  /** The `YYYY-MM` period the sweep charged for. */
  readonly period: string;
  readonly scanned: number;
  readonly charged: number;
  readonly waived: number;
  /** Accounts not open for a single day of the period. */
  readonly skipped: number;
  /** Accounts whose charge failed; the sweep continues past them. */
  readonly failed: number;
}

/** The running count a sweep builds up — the result without its period, and mutable. */
interface SweepTally {
  scanned: number;
  charged: number;
  waived: number;
  skipped: number;
  failed: number;
}

/**
 * The monthly maintenance fee, charged in arrears.
 *
 * Each run charges the last completed month: only then is the number of chargeable days
 * known exactly, which is what makes pro-rating honest — an account opened on the 10th
 * pays for 22 of 31 days, an account closed mid-month pays up to its closing day, and a
 * tier-waived account pays nothing with the waiver on record.
 *
 * Driven by the business clock, not the wall clock: the job wakes hourly in real time,
 * but the period under charge comes from `ClockService`, so advancing the simulated
 * clock a month charges exactly one month. Idempotent per `(account, period)` — the
 * unique charge key makes a re-run, a retried job or a double-fired schedule a no-op.
 */
@Injectable()
export class MaintenanceFeeService {
  private readonly logger = new Logger(MaintenanceFeeService.name);

  constructor(
    private readonly reader: ChargeableAccountReader,
    private readonly charging: FeeChargingService,
    private readonly clock: ClockService,
  ) {}

  /** Charges every chargeable account its maintenance fee for the last completed month. */
  async chargeDueMaintenance(): Promise<MaintenanceSweepResult> {
    const period = monthPeriodBefore(this.clock.now());
    const tally: SweepTally = { scanned: 0, charged: 0, waived: 0, skipped: 0, failed: 0 };
    let afterId: string | null = null;

    for (;;) {
      const batch = await this.reader.listChargeable(afterId, SWEEP_BATCH_SIZE);
      if (batch.length === 0) break;

      afterId = batch[batch.length - 1]?.id ?? afterId;
      for (const account of batch) {
        tally.scanned += 1;
        tally[await this.chargeOne(account, period)] += 1;
      }
    }

    this.logger.log(
      `Maintenance sweep ${period.key}: ${tally.charged} charged, ${tally.waived} waived, ` +
        `${tally.skipped} skipped, ${tally.failed} failed of ${tally.scanned}`,
    );
    return { period: period.key, ...tally };
  }

  /** One account's fee for the period; a failure is reported, never thrown onward. */
  private async chargeOne(account: ChargeableAccount, period: MonthPeriod): Promise<ChargeOutcome> {
    const activeDays = activeDaysWithin(period, account.openedAt, account.closedAt);
    if (activeDays === 0) return 'skipped';

    try {
      const charge = await this.charging.assess({
        accountId: account.id,
        kind: FeeKind.MONTHLY_MAINTENANCE,
        amount: fromStored({ amount: '0', currency: account.currency }),
        chargeKey: scheduledChargeKey(FeeKind.MONTHLY_MAINTENANCE, account.id, period.key),
        periodKey: period.key,
        source: FeeChargeSource.SCHEDULED,
        sourceId: null,
        description: `Monthly maintenance fee ${period.key}`,
        proRata: { activeDays, daysInMonth: period.daysInMonth },
      });

      return charge.waivedBy === null ? 'charged' : 'waived';
    } catch (error) {
      this.logger.warn(
        `Maintenance fee for ${account.id} (${period.key}) failed: ${errorMessage(error)}`,
      );
      return 'failed';
    }
  }
}

/** How one account's assessment ended, named after the tally field it increments. */
type ChargeOutcome = 'charged' | 'waived' | 'skipped' | 'failed';

/** A log-safe rendering of a caught failure. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'failed without an error message';
}
