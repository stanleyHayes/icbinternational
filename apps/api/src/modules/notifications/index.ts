/**
 * Public surface of the notification platform.
 *
 * A feature module that wants to tell a customer something needs exactly one thing:
 * `NotificationBus.publish(userId, 'TRANSFER_SENT', { … })`. Channels, preferences,
 * templates, retries and the mandatory-delivery rule are all behind that call, and none of
 * them are importable from outside this directory.
 *
 * The ports and in-memory twins are exported so another lane can stand the platform up in
 * a test without a database or a mail provider.
 */

export { NotificationsModule } from './notifications.module.js';
export { NotificationBus, type PublishResult } from './notification-bus.service.js';
export {
  NotificationCentreService,
  type ListNotificationsInput,
} from './notification-centre.service.js';
export { NotificationStreamService } from './stream/notification-stream.service.js';
export {
  NotificationPreferencesService,
  type ChannelDecision,
  type DecideChannelsInput,
} from './preferences/preferences.service.js';

// The message catalogue — also the event vocabulary `publish` is called with.
export {
  TEMPLATES,
  TEMPLATE_KEYS,
  categoryOf,
  defaultChannelsFor,
  isTemplateKey,
  isUrgent,
  renderTemplate,
  templateFor,
  type AnyTemplate,
  type TemplateKey,
  type TemplateProps,
} from './templates/template-registry.js';
export { type RenderedEmail, type TemplateLinks } from './templates/define-template.js';
export { lintEmail, type EmailLintFinding } from './templates/html-email-lint.js';

// Rules other lanes occasionally need to reason about.
export {
  ALWAYS_DELIVER_CATEGORIES,
  MANDATORY_CHANNELS,
  DEFAULT_QUIET_HOURS,
} from './notifications.constants.js';
export {
  defaultPreferences,
  isMandatory,
  presentPreferences,
  resolveChannels,
  type ResolveChannelsInput,
} from './preferences/preference-matrix.js';
export {
  isWithinQuietHours,
  quietHoursEndAfter,
  type QuietWindow,
} from './preferences/quiet-hours.js';

// Ports and their twins, for tests and for lanes that bind their own transport.
export { RecipientPort, type Recipient } from './ports/recipient.port.js';
export {
  EmailSenderPort,
  type EmailSendResult,
  type OutboundEmail,
} from './channels/email/email-sender.port.js';
export {
  InMemoryEmailSender,
  type CapturedEmail,
} from './channels/email/in-memory-email-sender.js';
export { SmsSenderPort, type OutboundSms } from './channels/sms/sms-sender.port.js';
export { NotificationStore, type NotificationRecord } from './notification.store.js';
export { InMemoryNotificationStore } from './in-memory-notification.store.js';
export { PreferenceStore, type PreferenceRecord } from './preferences/preference.store.js';
export { InMemoryPreferenceStore } from './preferences/in-memory-preference.store.js';
export { DeliveryStore } from './delivery/delivery.store.js';
export { InMemoryDeliveryStore } from './delivery/in-memory-delivery.store.js';
export { AddressHealth, DeliveryStatus, type DeliveryRecord } from './delivery/delivery.types.js';
export { DigestStore } from './digest/digest.store.js';
export { InMemoryDigestStore } from './digest/in-memory-digest.store.js';
export { PushSubscriptionStore } from './channels/push/push-subscription.store.js';
export { InMemoryPushSubscriptionStore } from './channels/push/in-memory-push-subscription.store.js';
