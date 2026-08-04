import { Injectable, Logger } from '@nestjs/common';

import { type FxAlertRecord } from './fx-alert.store.js';

/** What the customer is told when their level is reached. */
export interface RateAlertNotice {
  readonly alert: FxAlertRecord;
  /** The level that triggered it, as a decimal string. */
  readonly rate: string;
  readonly at: Date;
}

/**
 * How a fired rate alert reaches the customer.
 *
 * A port, because telling somebody something is the communications lane's job and this
 * lane has no business knowing whether that means a push notification, an email or a row
 * in a feed. The FX module decides *that* the level was reached; somebody else decides how
 * the customer hears about it.
 */
export abstract class RateAlertNotifierPort {
  abstract notify(notice: RateAlertNotice): Promise<void>;
}

/**
 * The default binding: record it and move on.
 *
 * Honest rather than silent. Until the communications lane binds a real notifier, a fired
 * alert is disarmed and written to the log with everything needed to reconstruct it, so
 * the evaluation job is genuinely working and the only missing piece is delivery. What it
 * will never do is pretend a message was sent.
 */
@Injectable()
export class LoggingRateAlertNotifier extends RateAlertNotifierPort {
  private readonly logger = new Logger(LoggingRateAlertNotifier.name);

  override async notify(notice: RateAlertNotice): Promise<void> {
    const { alert } = notice;
    this.logger.log(
      `Rate alert ${alert.id} for ${alert.userId}: ${alert.from}/${alert.to} reached ${notice.rate} (target ${alert.direction} ${alert.targetRate})`,
    );
  }
}
