import { NotificationChannel } from '@reliance/contracts';

import type { ClockService } from '../../../../../common/clock/clock.service.js';
import type { AppConfigService } from '../../../../../config/config.service.js';
import { FailureKind } from '../../../delivery/retry-policy.js';
import { PushChannel } from '../push.channel.js';
import { buildVapidAuthorization, encryptPushPayload } from '../web-push-crypto.js';

jest.mock('../web-push-crypto.js', () => ({
  buildVapidAuthorization: jest.fn(() => 'auth-header'),
  encryptPushPayload: jest.fn(() => ({ headers: { 'Content-Encoding': 'aes128gcm' }, body: 'cipher' })),
}));

describe('PushChannel', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
    })) as never;
  });

  function rig() {
    const subscriptions: {
      listForUser: jest.Mock;
      touch: jest.Mock;
      removeByEndpoint: jest.Mock;
      upsert: jest.Mock;
    } = {
      listForUser: jest.fn(async () => [
        { id: 'sub_1', endpoint: 'https://example.com/push', p256dh: 'p256dh', auth: 'auth' },
      ]),
      touch: jest.fn(async () => undefined),
      removeByEndpoint: jest.fn(async () => undefined),
      upsert: jest.fn(async () => undefined),
    };

    const config = {
      webPush: {
        enabled: true,
        subject: 'mailto:ops@example.com',
        publicKey: 'public',
        privateKey: 'private',
      },
    } as unknown as AppConfigService;

    const clock = {
      timestamp: jest.fn(() => 1_000_000),
      now: jest.fn(() => new Date('2026-03-01T09:00:00.000Z')),
    } as unknown as ClockService;

    const channel = new PushChannel(subscriptions, config, clock);
    return { channel, subscriptions, clock };
  }

  it('sends push notifications through each registered device and marks them delivered', async () => {
    const { channel, subscriptions } = rig();

    const outcome = await channel.send({
      recipient: { userId: 'user_1', emailAddress: null, phoneNumber: null, displayName: 'Ada' },
      message: { title: 'Pay', summary: 'You have a payment', templateKey: 'payment', subject: 'Payment', html: '<div/>', text: 'Payment', action: { label: 'Open', url: '/pay' } },
      destination: 'web-push',
      deliveryId: 'delivery_1',
    } as never);

    expect(outcome.ok).toBe(true);
    expect(subscriptions.touch).toHaveBeenCalled();
    expect(encryptPushPayload).toHaveBeenCalled();
    expect(buildVapidAuthorization).toHaveBeenCalled();
  });

  it('returns the correct destination and skips retries for dead subscriptions', async () => {
    const { channel, subscriptions } = rig();
    subscriptions.listForUser.mockResolvedValueOnce([]);
    const suppression = await channel.send({
      recipient: { userId: 'user_1', emailAddress: null, phoneNumber: null, displayName: 'Ada' },
      message: { title: 'Pay', summary: 'You have a payment', templateKey: 'payment', subject: 'Payment', html: '<div/>', text: 'Payment', action: null },
      destination: 'web-push',
      deliveryId: 'delivery_2',
    } as never);

    expect(channel.destinationFor({ userId: 'user_1', emailAddress: null, phoneNumber: null, displayName: 'Ada' })).toBe('web-push');
    expect(suppression.ok).toBe(false);
    expect((suppression as { failure: FailureKind }).failure).toBe(FailureKind.PERMANENT);

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 });
    const removed = await channel.send({
      recipient: { userId: 'user_1', emailAddress: null, phoneNumber: null, displayName: 'Ada' },
      message: { title: 'Pay', summary: 'You have a payment', templateKey: 'payment', subject: 'Payment', html: '<div/>', text: 'Payment', action: null },
      destination: 'web-push',
      deliveryId: 'delivery_3',
    } as never);

    expect(removed.ok).toBe(false);
    expect(subscriptions.removeByEndpoint).toHaveBeenCalled();
  });

  it('uses the push channel marker and supports disabling delivery', () => {
    const { channel } = rig();
    expect(channel.channel).toBe(NotificationChannel.PUSH);
    expect(channel.destinationFor({ userId: 'user_1', emailAddress: null, phoneNumber: null, displayName: 'Ada' })).toBe('web-push');
  });
});
