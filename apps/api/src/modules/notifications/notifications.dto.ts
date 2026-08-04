/**
 * Wire shapes the frozen contract does not name.
 *
 * `packages/contracts/src/modules/notifications.ts` carries the notification, the
 * preference matrix and the stream event. What it does not carry is the unread count, the
 * webhook Resend posts to us, or the admin template catalogue — so those are declared here
 * from contract primitives. If the contract is ever unfrozen they belong beside their
 * siblings there.
 */

import { z } from 'zod';

import { isoDateTimeSchema, shortTextSchema } from '@reliance/contracts';

/** Path the email provider posts delivery events to. Not customer-facing. */
export const EMAIL_WEBHOOK_ROUTE = '/webhooks/email';

/** Path the admin console previews a rendered message on. */
export const TEMPLATE_PREVIEW_ROUTE = '/admin/comms/templates/:key/preview';

export const unreadCountSchema = z.object({ unread: z.number().int().nonnegative() });
export type UnreadCount = z.infer<typeof unreadCountSchema>;

/**
 * The subset of Resend's webhook payload we act on.
 *
 * Passthrough rather than strict: a provider adds fields to its events without warning,
 * and rejecting an event because it grew a property would mean silently missing bounces.
 */
export const emailWebhookEventSchema = z
  .object({
    type: z.string(),
    created_at: z.string().optional(),
    data: z
      .object({
        email_id: z.string().optional(),
        to: z.union([z.string(), z.array(z.string())]).optional(),
        bounce: z
          .object({ type: z.string().optional(), message: z.string().optional() })
          .optional(),
      })
      .loose(),
  })
  .loose();
export type EmailWebhookEvent = z.infer<typeof emailWebhookEventSchema>;

export const templateSummarySchema = z.object({
  key: shortTextSchema,
  category: shortTextSchema,
  severity: shortTextSchema,
  channels: z.array(shortTextSchema),
  urgent: z.boolean(),
  subject: shortTextSchema,
});
export type TemplateSummary = z.infer<typeof templateSummarySchema>;

export const templatePreviewSchema = z.object({
  key: shortTextSchema,
  subject: shortTextSchema,
  preheader: shortTextSchema,
  html: z.string(),
  text: z.string(),
  /** Empty when the rendered message passes every rule in the HTML-email lint. */
  lintFindings: z.array(z.object({ rule: z.string(), detail: z.string() })),
});
export type TemplatePreview = z.infer<typeof templatePreviewSchema>;

export const pushSubscriptionAcceptedSchema = z.object({
  subscribed: z.literal(true),
  registeredAt: isoDateTimeSchema,
});
export type PushSubscriptionAccepted = z.infer<typeof pushSubscriptionAcceptedSchema>;
