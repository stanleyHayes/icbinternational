/**
 * Delivery, retry, and what a bounce does to an address.
 *
 * The acceptance criterion for the channel lane is that a bounced email arriving on the
 * provider's webhook is recorded and marks the address degraded — and that a degraded
 * address is then skipped rather than retried into the ground.
 */

import { NotificationChannel } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type ChannelRecipient, type OutboundMessage } from '../channels/channel.port.js';
import { EmailWebhookService } from '../channels/email/email-webhook.service.js';
import { EmailChannel } from '../channels/email/email.channel.js';
import { InMemoryEmailSender } from '../channels/email/in-memory-email-sender.js';
import { InAppChannel } from '../channels/in-app.channel.js';
import { ChannelRegistry } from '../delivery/channel-registry.js';
import { DeliveryService } from '../delivery/delivery.service.js';
import { AddressHealth, DeliveryStatus } from '../delivery/delivery.types.js';
import { InMemoryDeliveryStore } from '../delivery/in-memory-delivery.store.js';
import { backoffSeconds, decideRetry, FailureKind, seedFrom } from '../delivery/retry-policy.js';
import { MAX_DELIVERY_ATTEMPTS } from '../notifications.constants.js';

const ADDRESS = 'amara.okafor@example.com';

const RECIPIENT: ChannelRecipient = {
  userId: 'usr_01HTEST',
  emailAddress: ADDRESS,
  phoneNumber: null,
  displayName: 'Amara Okafor',
};

const MESSAGE: OutboundMessage = {
  templateKey: 'TRANSFER_SENT',
  summary: 'You sent £1,150.00 to Rosewood Lettings.',
  subject: 'You sent £1,150.00 to Rosewood Lettings',
  html: '<p>Payment sent</p>',
  text: 'Payment sent',
  title: 'Payment sent',
  action: null,
};

function build() {
  const clock = new ClockService();
  const store = new InMemoryDeliveryStore(new IdGenerator(), clock);
  const sender = new InMemoryEmailSender();
  const registry = new ChannelRegistry([new InAppChannel(), new EmailChannel(sender)]);
  const deliveries = new DeliveryService(store, registry, clock);
  const webhooks = new EmailWebhookService(store, clock);

  return { clock, store, sender, deliveries, webhooks };
}

describe('sending an email', () => {
  it('records the row before the send and marks it sent afterwards', async () => {
    const { deliveries, sender } = build();

    const row = await deliveries.dispatch({
      recipient: RECIPIENT,
      message: MESSAGE,
      channel: NotificationChannel.EMAIL,
      notificationId: null,
      holdUntil: null,
    });

    expect(row.status).toBe(DeliveryStatus.SENT);
    expect(row.attempts).toBe(1);
    expect(row.providerMessageId).not.toBeNull();
    expect(sender.outbox).toHaveLength(1);
    expect(sender.lastTo(ADDRESS)?.subject).toContain('Rosewood Lettings');
  });

  it('leaves a held delivery queued and unsent until its time', async () => {
    const { clock, deliveries, sender } = build();

    const row = await deliveries.dispatch({
      recipient: RECIPIENT,
      message: MESSAGE,
      channel: NotificationChannel.EMAIL,
      notificationId: null,
      holdUntil: new Date(clock.timestamp() + 60_000),
    });

    expect(row.status).toBe(DeliveryStatus.QUEUED);
    expect(row.attempts).toBe(0);
    expect(sender.outbox).toHaveLength(0);
  });

  it('carries the delivery id as the idempotency key, so a retry cannot duplicate', async () => {
    const { deliveries, sender } = build();

    const row = await deliveries.dispatch({
      recipient: RECIPIENT,
      message: MESSAGE,
      channel: NotificationChannel.EMAIL,
      notificationId: null,
      holdUntil: null,
    });

    await deliveries.attempt(row, RECIPIENT, MESSAGE);

    expect(sender.outbox).toHaveLength(1);
    expect(sender.outbox[0]?.idempotencyKey).toBe(row.id);
  });

  it('queues a retry after a transient failure', async () => {
    const { deliveries, sender } = build();
    sender.failNext('The provider timed out');

    const row = await deliveries.dispatch({
      recipient: RECIPIENT,
      message: MESSAGE,
      channel: NotificationChannel.EMAIL,
      notificationId: null,
      holdUntil: null,
    });

    expect(row.status).toBe(DeliveryStatus.QUEUED);
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).not.toBeNull();
  });

  it('gives up immediately on a permanent failure rather than burning the budget', async () => {
    const { deliveries, sender } = build();
    sender.failNext('invalid_to_address: not a mailbox', true);

    const row = await deliveries.dispatch({
      recipient: RECIPIENT,
      message: MESSAGE,
      channel: NotificationChannel.EMAIL,
      notificationId: null,
      holdUntil: null,
    });

    expect(row.status).toBe(DeliveryStatus.FAILED);
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt).toBeNull();
  });

  it('suppresses rather than attempts when there is no address', async () => {
    const { deliveries, sender } = build();

    const row = await deliveries.dispatch({
      recipient: { ...RECIPIENT, emailAddress: null },
      message: MESSAGE,
      channel: NotificationChannel.EMAIL,
      notificationId: null,
      holdUntil: null,
    });

    expect(row.status).toBe(DeliveryStatus.SUPPRESSED);
    expect(sender.outbox).toHaveLength(0);
  });
});

describe('the provider webhook', () => {
  async function sendOne() {
    const context = build();
    const row = await context.deliveries.dispatch({
      recipient: RECIPIENT,
      message: MESSAGE,
      channel: NotificationChannel.EMAIL,
      notificationId: null,
      holdUntil: null,
    });
    return { ...context, row };
  }

  it('records a delivery confirmation against the row', async () => {
    const { webhooks, store, row } = await sendOne();

    await webhooks.ingest({
      type: 'email.delivered',
      data: { email_id: row.providerMessageId ?? '', to: ADDRESS },
    });

    const updated = await store.findDelivery(row.id);
    expect(updated?.status).toBe(DeliveryStatus.DELIVERED);
  });

  it('marks the address degraded on a hard bounce', async () => {
    const { webhooks, store, row } = await sendOne();

    await webhooks.ingest({
      type: 'email.bounced',
      data: {
        email_id: row.providerMessageId ?? '',
        to: ADDRESS,
        bounce: { type: 'Permanent', message: 'The recipient does not exist.' },
      },
    });

    const updated = await store.findDelivery(row.id);
    expect(updated?.status).toBe(DeliveryStatus.BOUNCED);

    const health = await store.healthOf(NotificationChannel.EMAIL, ADDRESS);
    expect(health?.health).toBe(AddressHealth.DEGRADED);
    expect(health?.lastReason).toContain('does not exist');
  });

  it('does not degrade an address on a soft bounce', async () => {
    const { webhooks, store, row } = await sendOne();

    await webhooks.ingest({
      type: 'email.bounced',
      data: {
        email_id: row.providerMessageId ?? '',
        to: ADDRESS,
        bounce: { type: 'Transient', message: 'The mailbox is full.' },
      },
    });

    const health = await store.healthOf(NotificationChannel.EMAIL, ADDRESS);
    expect(health?.health).toBe(AddressHealth.HEALTHY);
  });

  it('degrades on a single complaint', async () => {
    const { webhooks, store, row } = await sendOne();

    await webhooks.ingest({
      type: 'email.complained',
      data: { email_id: row.providerMessageId ?? '', to: ADDRESS },
    });

    const health = await store.healthOf(NotificationChannel.EMAIL, ADDRESS);
    expect(health?.health).toBe(AddressHealth.DEGRADED);
  });

  it('skips a degraded address on the next send instead of retrying it', async () => {
    const { webhooks, deliveries, sender, row } = await sendOne();

    await webhooks.ingest({
      type: 'email.bounced',
      data: {
        email_id: row.providerMessageId ?? '',
        to: ADDRESS,
        bounce: { type: 'hard', message: 'No such user.' },
      },
    });

    const before = sender.outbox.length;
    const next = await deliveries.dispatch({
      recipient: RECIPIENT,
      message: MESSAGE,
      channel: NotificationChannel.EMAIL,
      notificationId: null,
      holdUntil: null,
    });

    expect(next.status).toBe(DeliveryStatus.SUPPRESSED);
    expect(next.lastError).toContain('undeliverable');
    expect(sender.outbox).toHaveLength(before);
  });

  it('acknowledges an event type it does not act on rather than making the provider retry', async () => {
    const { webhooks } = build();

    const outcome = await webhooks.ingest({ type: 'email.opened', data: { to: ADDRESS } });
    expect(outcome.handled).toBe(false);
  });
});

describe('the retry policy', () => {
  it('backs off exponentially and caps', () => {
    const first = backoffSeconds(1, 0);
    const second = backoffSeconds(2, 0);
    const late = backoffSeconds(20, 0);

    expect(second).toBeGreaterThan(first);
    expect(late).toBeLessThanOrEqual(backoffSeconds(30, 0));
  });

  it('jitters deterministically from the delivery id', () => {
    const seed = seedFrom('ntf_01HABCDEF');
    expect(backoffSeconds(3, seed)).toBe(backoffSeconds(3, seed));
  });

  it('stops once the attempt budget is spent', () => {
    const decision = decideRetry({
      attemptsMade: MAX_DELIVERY_ATTEMPTS,
      failure: FailureKind.TRANSIENT,
      now: new Date(0),
      seed: 1,
    });

    expect(decision.shouldRetry).toBe(false);
  });

  it('never retries a permanent failure', () => {
    const decision = decideRetry({
      attemptsMade: 1,
      failure: FailureKind.PERMANENT,
      now: new Date(0),
      seed: 1,
    });

    expect(decision.shouldRetry).toBe(false);
  });
});
