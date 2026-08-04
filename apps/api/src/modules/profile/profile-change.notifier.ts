/**
 * Telling the customer their details changed.
 *
 * Not optional and not a preference. A change made without the customer's knowledge is the
 * first step in an account takeover, and it only stays invisible if we decide not to
 * mention it — which is why `ACCOUNT_DETAILS_CHANGED` is filed as a security message and
 * why this runs on every successful patch rather than on the interesting ones.
 *
 * A service of its own so `ProfileService` stays about the record. It also keeps the
 * failure boundary obvious: `publish` never throws, so an email provider having a bad
 * afternoon cannot lose a change the customer already made.
 */

import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { NotificationBus } from '../notifications/index.js';

import { describeFields } from './profile-update.rules.js';
import { PROFILE_LOCALE } from './profile.constants.js';

/** How the changed-at instant is written into the message. */
const CHANGED_AT_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
};

@Injectable()
export class ProfileChangeNotifier {
  constructor(
    private readonly notifications: NotificationBus,
    private readonly clock: ClockService,
  ) {}

  /** Announces a change. A patch that moved nothing is not a change and is not announced. */
  async announce(userId: string, fields: readonly string[]): Promise<void> {
    if (fields.length === 0) return;

    await this.notifications.publish(userId, 'ACCOUNT_DETAILS_CHANGED', {
      changeDescription: describeFields(fields),
      changedAt: new Intl.DateTimeFormat(PROFILE_LOCALE, CHANGED_AT_FORMAT).format(
        this.clock.now(),
      ),
    });
  }
}
