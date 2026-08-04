/**
 * Reading and writing a customer's notification preferences.
 *
 * The service is deliberately thin: it loads, merges, validates and saves. Every decision
 * about what the matrix *means* lives in `preference-matrix.ts` and `quiet-hours.ts`,
 * which are pure and can be tested against the awkward cases — a muted security row, a
 * window that wraps midnight, a timezone the runtime has never heard of — without any of
 * this machinery.
 */

import { Injectable } from '@nestjs/common';

import {
  ErrorCode,
  type ChannelPreference,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPreferences,
} from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { DEFAULT_TIMEZONE } from '../notifications.constants.js';

import {
  defaultPreferences,
  mergePreferences,
  presentPreferences,
  resolveChannels,
} from './preference-matrix.js';
import { PreferenceStore, type PreferenceRecord } from './preference.store.js';
import {
  isKnownTimezone,
  isWithinQuietHours,
  parseClockTime,
  quietHoursEndAfter,
} from './quiet-hours.js';

export interface ChannelDecision {
  readonly channels: readonly NotificationChannel[];
  /** When quiet hours mean this should wait, the instant it may go. Null means "now". */
  readonly holdUntil: Date | null;
}

export interface DecideChannelsInput {
  readonly userId: string;
  readonly category: NotificationCategory;
  readonly candidateChannels: readonly NotificationChannel[];
  /** Skips quiet hours entirely. Security and time-critical money messages set it. */
  readonly urgent: boolean;
  readonly unavailableChannels?: readonly NotificationChannel[];
}

@Injectable()
export class NotificationPreferencesService {
  constructor(
    private readonly store: PreferenceStore,
    private readonly clock: ClockService,
  ) {}

  /** The customer's matrix, with mandatory categories shown as the on switches they are. */
  async get(userId: string): Promise<NotificationPreferences> {
    const record = await this.store.findFor(userId);

    return {
      preferences: presentPreferences(record?.preferences ?? defaultPreferences()),
      quietHours: record?.quietHours ?? null,
      timezone: record?.timezone ?? DEFAULT_TIMEZONE,
    };
  }

  /**
   * Replaces the matrix.
   *
   * @throws {AppError} `VALIDATION_FAILED` when the quiet window or timezone is unusable.
   *   Storing an unparseable window would silently disable quiet hours, which the customer
   *   would only discover at 3am.
   */
  async update(
    userId: string,
    submitted: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    assertUsableWindow(submitted);

    const existing = await this.store.findFor(userId);
    const merged = mergePreferences(existing?.preferences ?? [], submitted.preferences);

    await this.store.save({
      userId,
      preferences: merged,
      quietHours: submitted.quietHours,
      timezone: submitted.timezone,
      digestEnabledCategories: existing?.digestEnabledCategories ?? [],
    });

    return this.get(userId);
  }

  /**
   * The delivery decision for one notification.
   *
   * A mandatory category comes back with its channels regardless of the stored matrix, and
   * never with a `holdUntil` — quiet hours are not consulted for it at all.
   */
  async decideChannels(input: DecideChannelsInput): Promise<ChannelDecision> {
    const record = await this.store.findFor(input.userId);
    const preferences = record?.preferences ?? defaultPreferences();

    const channels = resolveChannels({
      category: input.category,
      candidateChannels: input.candidateChannels,
      preferences,
      ...(input.unavailableChannels ? { unavailableChannels: input.unavailableChannels } : {}),
    });

    return { channels, holdUntil: this.holdUntilFor(record, input.urgent) };
  }

  /** The raw stored row, for the digest service. */
  async record(userId: string): Promise<PreferenceRecord | null> {
    return this.store.findFor(userId);
  }

  private holdUntilFor(record: PreferenceRecord | null, urgent: boolean): Date | null {
    if (urgent || !record?.quietHours) return null;

    const timezone = isKnownTimezone(record.timezone) ? record.timezone : DEFAULT_TIMEZONE;
    const now = this.clock.now();
    if (!isWithinQuietHours(now, record.quietHours, timezone)) return null;

    return quietHoursEndAfter(now, record.quietHours, timezone);
  }
}

function assertUsableWindow(submitted: NotificationPreferences): void {
  if (!isKnownTimezone(submitted.timezone)) {
    throw AppError.validation('We do not recognise that time zone.', [
      { path: 'timezone', message: 'Choose a time zone from the list.' },
    ]);
  }

  const { quietHours } = submitted;
  if (!quietHours) return;

  const from = parseClockTime(quietHours.from);
  const to = parseClockTime(quietHours.to);

  if (from === null || to === null) {
    throw AppError.validation('Enter quiet hours as a start and end time.', [
      { path: 'quietHours', message: 'Use 24-hour times, for example 22:00 and 07:00.' },
    ]);
  }

  if (from === to) {
    throw new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Quiet hours must start and end at different times.',
      details: [{ path: 'quietHours.to', message: 'Choose an end time later than the start.' }],
    });
  }
}

/** Re-exported so callers do not reach past the service into the matrix module. */
export type { ChannelPreference };
