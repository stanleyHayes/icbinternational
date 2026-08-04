/**
 * The delivery log: one row per (notification, channel) attempt sequence.
 *
 * A bank has to be able to answer "did you tell me?" with more than a shrug. The log
 * records what was sent, where, when, how many attempts it took and what the provider
 * said — including the webhook that arrived twenty minutes later saying the address had
 * bounced.
 */

import { type NotificationChannel } from '@reliance/contracts';

export const DeliveryStatus = {
  /** Waiting for its first attempt, or held until quiet hours end. */
  QUEUED: 'QUEUED',
  /** Handed to the provider; no confirmation yet. */
  SENT: 'SENT',
  /** The provider confirmed it reached the recipient's server. */
  DELIVERED: 'DELIVERED',
  /** Rejected by the recipient's server. Hard bounces degrade the address. */
  BOUNCED: 'BOUNCED',
  /** The recipient marked it as unwanted. Permanent, and immediate. */
  COMPLAINED: 'COMPLAINED',
  /** Attempts exhausted, or refused before sending. */
  FAILED: 'FAILED',
  /** Deliberately not sent — muted, no address, or a degraded one. */
  SUPPRESSED: 'SUPPRESSED',
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

/** Statuses from which no further work will happen. */
export const TERMINAL_STATUSES: readonly DeliveryStatus[] = Object.freeze([
  DeliveryStatus.DELIVERED,
  DeliveryStatus.BOUNCED,
  DeliveryStatus.COMPLAINED,
  DeliveryStatus.FAILED,
  DeliveryStatus.SUPPRESSED,
]);

export interface DeliveryRecord {
  readonly id: string;
  readonly userId: string;
  /** The in-app notification this delivery belongs to, when there is one. */
  readonly notificationId: string | null;
  readonly templateKey: string;
  readonly channel: NotificationChannel;
  /** Masked in logs; stored whole because a bounce has to be attributable to an address. */
  readonly destination: string;
  readonly status: DeliveryStatus;
  readonly attempts: number;
  /** Provider-side identifier, so a webhook can find this row. */
  readonly providerMessageId: string | null;
  readonly lastError: string | null;
  /** When the next attempt becomes due. Null once the row is terminal. */
  readonly nextAttemptAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type NewDelivery = Omit<
  DeliveryRecord,
  'id' | 'attempts' | 'providerMessageId' | 'lastError' | 'createdAt' | 'updatedAt'
>;

export interface DeliveryOutcomeUpdate {
  readonly id: string;
  readonly status: DeliveryStatus;
  readonly attempts: number;
  readonly providerMessageId?: string | null;
  readonly lastError?: string | null;
  readonly nextAttemptAt: Date | null;
  readonly at: Date;
}

/** How an address is behaving. A degraded address is skipped rather than retried forever. */
export const AddressHealth = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
} as const;
export type AddressHealth = (typeof AddressHealth)[keyof typeof AddressHealth];

export interface AddressHealthRecord {
  readonly channel: NotificationChannel;
  /** Lower-cased email address, or E.164 number. */
  readonly destination: string;
  readonly health: AddressHealth;
  readonly bounceCount: number;
  readonly complaintCount: number;
  readonly lastReason: string | null;
  readonly updatedAt: Date;
}
