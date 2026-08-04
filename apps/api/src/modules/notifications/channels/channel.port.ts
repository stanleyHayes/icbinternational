/**
 * What a channel has to be able to do.
 *
 * Four implementations: in-app, email, SMS and web push. Each takes a rendered message and
 * a recipient, and answers with an outcome the delivery log can record — never by throwing
 * for a routine failure. A provider being down is an expected state of the world; an
 * exception escaping a channel means something is wrong with the code, not the network.
 */

import { type NotificationChannel } from '@reliance/contracts';

import { type FailureKind } from '../delivery/retry-policy.js';

/** The message, rendered once and offered to every channel in the form it needs. */
export interface OutboundMessage {
  readonly templateKey: string;
  /** One line. What SMS sends, what push shows, what the notification centre lists. */
  readonly summary: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly title: string;
  readonly action: { readonly label: string; readonly url: string } | null;
}

export interface ChannelRecipient {
  readonly userId: string;
  readonly emailAddress: string | null;
  readonly phoneNumber: string | null;
  readonly displayName: string;
}

export type SendOutcome =
  | { readonly ok: true; readonly providerMessageId: string | null }
  | { readonly ok: false; readonly failure: FailureKind; readonly reason: string };

export const sent = (providerMessageId: string | null): SendOutcome => ({
  ok: true,
  providerMessageId,
});

export const failed = (failure: FailureKind, reason: string): SendOutcome => ({
  ok: false,
  failure,
  reason,
});

export abstract class NotificationChannelAdapter {
  abstract readonly channel: NotificationChannel;

  /**
   * The address this channel would use, or `null` when there is none.
   *
   * Consulted before sending so a customer with no verified phone is recorded as
   * `SUPPRESSED` rather than accumulating five failed SMS attempts.
   */
  abstract destinationFor(recipient: ChannelRecipient): string | null;

  abstract send(input: SendInput): Promise<SendOutcome>;
}

export interface SendInput {
  readonly recipient: ChannelRecipient;
  readonly message: OutboundMessage;
  readonly destination: string;
  /**
   * The delivery-log row this attempt belongs to.
   *
   * Passed to the provider as an idempotency key. The retry sweep re-attempts sends whose
   * outcome was never learned, and without this a lost acknowledgement becomes a second
   * copy of the same payment confirmation in the customer's inbox.
   */
  readonly deliveryId: string;
  /** One-click unsubscribe target. Absent on mandatory security mail. */
  readonly unsubscribeUrl?: string;
}
