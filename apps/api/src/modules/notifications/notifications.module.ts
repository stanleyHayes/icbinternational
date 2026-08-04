import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ClockModule } from '../../common/clock/clock.module.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { AppConfigService } from '../../config/config.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../auth/users/index.js';
import { RbacModule } from '../rbac/index.js';

import { NotificationChannelAdapter } from './channels/channel.port.js';
import { EmailSenderPort } from './channels/email/email-sender.port.js';
import { EmailWebhookController } from './channels/email/email-webhook.controller.js';
import { EmailWebhookService } from './channels/email/email-webhook.service.js';
import { EmailChannel } from './channels/email/email.channel.js';
import { LoggingEmailSender } from './channels/email/logging-email-sender.js';
import { ResendEmailSender } from './channels/email/resend-email-sender.js';
import { InAppChannel } from './channels/in-app.channel.js';
import { PushSubscriptionRepository } from './channels/push/push-subscription.repository.js';
import { PushSubscriptionSchema } from './channels/push/push-subscription.schema.js';
import { PushSubscriptionStore } from './channels/push/push-subscription.store.js';
import { PushChannel } from './channels/push/push.channel.js';
import { SmsSenderPort } from './channels/sms/sms-sender.port.js';
import { RecordingSmsSender, SmsChannel } from './channels/sms/sms.channel.js';
import { ChannelRegistry } from './delivery/channel-registry.js';
import { DeliveryRepository } from './delivery/delivery.repository.js';
import { AddressHealthSchema, DeliverySchema } from './delivery/delivery.schema.js';
import { DeliveryService } from './delivery/delivery.service.js';
import { DeliveryStore } from './delivery/delivery.store.js';
import { RetrySweeperService } from './delivery/retry-sweeper.service.js';
import { DigestRepository } from './digest/digest.repository.js';
import { DigestSchema } from './digest/digest.schema.js';
import { DigestService } from './digest/digest.service.js';
import { DigestStore } from './digest/digest.store.js';
import { NotificationBus } from './notification-bus.service.js';
import { NotificationCentreService } from './notification-centre.service.js';
import { NotificationRepository } from './notification.repository.js';
import { NotificationSchema } from './notification.schema.js';
import { NotificationStore } from './notification.store.js';
import {
  ADDRESS_HEALTH_MODEL,
  DELIVERY_MODEL,
  DIGEST_MODEL,
  NOTIFICATION_MODEL,
  PREFERENCE_MODEL,
  PUSH_SUBSCRIPTION_MODEL,
} from './notifications.constants.js';
import { NotificationsController } from './notifications.controller.js';
import { RecipientPort } from './ports/recipient.port.js';
import { UsersRecipientAdapter } from './ports/users-recipient.adapter.js';
import { PreferenceRepository } from './preferences/preference.repository.js';
import { PreferenceSchema } from './preferences/preference.schema.js';
import { PreferenceStore } from './preferences/preference.store.js';
import { NotificationPreferencesService } from './preferences/preferences.service.js';
import { NotificationStreamService } from './stream/notification-stream.service.js';
import { TemplateLinksService } from './templates/template-links.service.js';
import { TemplatesAdminController } from './templates/templates-admin.controller.js';

/**
 * The notification platform.
 *
 * The email transport is bound at boot from configuration rather than checked at each
 * send: with `RESEND_API_KEY` set the API talks to Resend, without it messages are written
 * to the log and the whole platform still runs end to end. A developer who has not signed
 * up for an email provider should still be able to register, receive a verification code
 * and finish onboarding — the alternative makes the most important path in the product the
 * hardest one to exercise.
 *
 * Channels are registered as multi-providers under `NotificationChannelAdapter` and looked
 * up by {@link ChannelRegistry}. Adding a channel is a provider registration; no service
 * has a `switch` over channel names.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NOTIFICATION_MODEL, schema: NotificationSchema },
      { name: PREFERENCE_MODEL, schema: PreferenceSchema },
      { name: DELIVERY_MODEL, schema: DeliverySchema },
      { name: ADDRESS_HEALTH_MODEL, schema: AddressHealthSchema },
      { name: PUSH_SUBSCRIPTION_MODEL, schema: PushSubscriptionSchema },
      { name: DIGEST_MODEL, schema: DigestSchema },
    ]),
    ClockModule,
    AuthModule,
    UsersModule,
    RbacModule,
  ],
  controllers: [NotificationsController, EmailWebhookController, TemplatesAdminController],
  providers: [
    { provide: NotificationStore, useClass: NotificationRepository },
    { provide: PreferenceStore, useClass: PreferenceRepository },
    { provide: DeliveryStore, useClass: DeliveryRepository },
    { provide: PushSubscriptionStore, useClass: PushSubscriptionRepository },
    { provide: DigestStore, useClass: DigestRepository },
    { provide: RecipientPort, useClass: UsersRecipientAdapter },
    {
      provide: EmailSenderPort,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): EmailSenderPort =>
        config.email.enabled ? new ResendEmailSender(config) : new LoggingEmailSender(),
    },
    { provide: SmsSenderPort, useClass: RecordingSmsSender },

    InAppChannel,
    EmailChannel,
    SmsChannel,
    PushChannel,
    {
      provide: NotificationChannelAdapter,
      inject: [InAppChannel, EmailChannel, SmsChannel, PushChannel],
      useFactory: (...adapters: NotificationChannelAdapter[]): NotificationChannelAdapter[] =>
        adapters,
    },
    ChannelRegistry,

    NotificationPreferencesService,
    NotificationCentreService,
    NotificationStreamService,
    DeliveryService,
    DigestService,
    EmailWebhookService,
    RetrySweeperService,
    TemplateLinksService,
    NotificationBus,
    IdGenerator,
  ],
  exports: [
    NotificationBus,
    NotificationCentreService,
    NotificationPreferencesService,
    NotificationStreamService,
    NotificationStore,
    DeliveryStore,
    EmailSenderPort,
  ],
})
export class NotificationsModule {}
