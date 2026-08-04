/** Fixtures and fakes shared by the notification suites. */

import { NotificationChannel } from '@reliance/contracts';

import { type ClockService } from '../../../common/clock/clock.service.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type AppConfigService } from '../../../config/config.service.js';
import {
  NotificationChannelAdapter,
  sent,
  type ChannelRecipient,
  type SendInput,
  type SendOutcome,
} from '../channels/channel.port.js';
import { ChannelRegistry } from '../delivery/channel-registry.js';
import { DeliveryService } from '../delivery/delivery.service.js';
import { InMemoryDeliveryStore } from '../delivery/in-memory-delivery.store.js';
import { DigestService } from '../digest/digest.service.js';
import { InMemoryDigestStore } from '../digest/in-memory-digest.store.js';
import { InMemoryNotificationStore } from '../in-memory-notification.store.js';
import { NotificationBus } from '../notification-bus.service.js';
import { NotificationCentreService } from '../notification-centre.service.js';
import { RecipientPort, type Recipient } from '../ports/recipient.port.js';
import { InMemoryPreferenceStore } from '../preferences/in-memory-preference.store.js';
import { NotificationPreferencesService } from '../preferences/preferences.service.js';
import { NotificationStreamService } from '../stream/notification-stream.service.js';
import { TemplateLinksService } from '../templates/template-links.service.js';

export const USER_ID = 'usr_01JQY4G8A8ZX1K5M3K0Z3X0K01';

export const RECIPIENT: Recipient = {
  userId: USER_ID,
  displayName: 'Ada Lovelace',
  firstName: 'Ada',
  emailAddress: 'ada@example.com',
  phoneNumber: '+447700900123',
  locale: 'en-GB',
};

/** A channel adapter that records what it was asked to send instead of sending it. */
export class RecordingChannel extends NotificationChannelAdapter {
  readonly sentInputs: SendInput[] = [];

  constructor(
    override readonly channel: NotificationChannel,
    private readonly addressOf: (recipient: ChannelRecipient) => string | null,
  ) {
    super();
  }

  destinationFor(recipient: ChannelRecipient): string | null {
    return this.addressOf(recipient);
  }

  async send(input: SendInput): Promise<SendOutcome> {
    this.sentInputs.push(input);
    return sent(`pm_${input.deliveryId}`);
  }
}

/** Serves the one customer the suites care about; everyone else does not exist. */
class StaticRecipients extends RecipientPort {
  constructor(private readonly recipient: Recipient) {
    super();
  }

  override async find(userId: string): Promise<Recipient | null> {
    return userId === this.recipient.userId ? this.recipient : null;
  }
}

/** A `ClockService` the test moves by hand. */
export interface FakeClock {
  readonly service: ClockService;
  set(instant: Date): void;
  advance(milliseconds: number): void;
}

export function fakeClock(start: Date): FakeClock {
  let current = start.getTime();

  return {
    service: {
      now: () => new Date(current),
      timestamp: () => current,
    } as unknown as ClockService,
    set(instant: Date) {
      current = instant.getTime();
    },
    advance(milliseconds: number) {
      current += milliseconds;
    },
  };
}

export interface BusHarness {
  readonly bus: NotificationBus;
  readonly digests: DigestService;
  readonly notifications: InMemoryNotificationStore;
  readonly preferenceStore: InMemoryPreferenceStore;
  readonly deliveryStore: InMemoryDeliveryStore;
  readonly digestStore: InMemoryDigestStore;
  readonly email: RecordingChannel;
  readonly sms: RecordingChannel;
  readonly clock: FakeClock;
}

const CONFIG = {
  allowedOrigins: [
    'https://www.reliancebank.test',
    'https://app.reliancebank.test',
    'https://ops.reliancebank.test',
  ],
} as unknown as AppConfigService;

/** The bus wired end to end against in-memory stores and recording channels. */
export function buildBusHarness(start: Date, recipient: Recipient = RECIPIENT): BusHarness {
  const clock = fakeClock(start);
  const notifications = new InMemoryNotificationStore();
  const preferenceStore = new InMemoryPreferenceStore(clock.service);
  const preferences = new NotificationPreferencesService(preferenceStore, clock.service);
  const email = new RecordingChannel(NotificationChannel.EMAIL, (r) => r.emailAddress);
  const sms = new RecordingChannel(NotificationChannel.SMS, (r) => r.phoneNumber);
  const deliveryStore = new InMemoryDeliveryStore(new IdGenerator(), clock.service);
  const deliveries = new DeliveryService(
    deliveryStore,
    new ChannelRegistry([email, sms]),
    clock.service,
  );
  const recipients = new StaticRecipients(recipient);
  const links = new TemplateLinksService(CONFIG);
  const digestStore = new InMemoryDigestStore();
  const digests = new DigestService(
    digestStore,
    deliveries,
    recipients,
    preferences,
    links,
    clock.service,
  );
  const stream = new NotificationStreamService(clock.service);
  const centre = new NotificationCentreService(notifications, stream, clock.service);
  const bus = new NotificationBus(centre, preferences, deliveries, recipients, digests, links);

  return {
    bus,
    digests,
    notifications,
    preferenceStore,
    deliveryStore,
    digestStore,
    email,
    sms,
    clock,
  };
}
