/**
 * Persistence boundary for the delivery log and address health.
 *
 * Both live behind one abstraction because they are written together: a bounce webhook
 * updates the delivery row and the address's health in the same breath, and splitting them
 * across two stores would invite a caller that updates one and forgets the other.
 */

import { type NotificationChannel } from '@reliance/contracts';

import {
  type AddressHealthRecord,
  type DeliveryOutcomeUpdate,
  type DeliveryRecord,
  type NewDelivery,
} from './delivery.types.js';

export interface RecordBounceInput {
  readonly channel: NotificationChannel;
  readonly destination: string;
  readonly reason: string;
  readonly permanent: boolean;
  readonly at: Date;
}

export interface RecordComplaintInput {
  readonly channel: NotificationChannel;
  readonly destination: string;
  readonly at: Date;
}

export abstract class DeliveryStore {
  abstract insert(delivery: NewDelivery, at: Date): Promise<DeliveryRecord>;

  abstract findDelivery(id: string): Promise<DeliveryRecord | null>;

  /** Finds the row a provider webhook refers to. */
  abstract findByProviderMessageId(providerMessageId: string): Promise<DeliveryRecord | null>;

  abstract applyOutcome(update: DeliveryOutcomeUpdate): Promise<DeliveryRecord | null>;

  /** Rows whose next attempt is now due, oldest first. */
  abstract findDue(now: Date, limit: number): Promise<DeliveryRecord[]>;

  abstract listForUser(userId: string, limit: number): Promise<DeliveryRecord[]>;

  // --- Address health ---------------------------------------------------

  abstract healthOf(
    channel: NotificationChannel,
    destination: string,
  ): Promise<AddressHealthRecord | null>;

  /** Destinations currently degraded for a channel, for the delivery-time skip check. */
  abstract degradedAmong(
    channel: NotificationChannel,
    destinations: readonly string[],
  ): Promise<string[]>;

  /**
   * Records a bounce and degrades the address once the threshold is crossed.
   *
   * A soft bounce — a full mailbox, a greylist — is counted but does not degrade on its
   * own, because the address is fine and the mailbox is not.
   */
  abstract recordBounce(input: RecordBounceInput): Promise<AddressHealthRecord>;

  /** Records a complaint. One is enough to degrade the address permanently. */
  abstract recordComplaint(input: RecordComplaintInput): Promise<AddressHealthRecord>;

  /** Returns an address to healthy — used when a customer re-verifies it. */
  abstract clearDegradation(channel: NotificationChannel, destination: string): Promise<void>;
}
