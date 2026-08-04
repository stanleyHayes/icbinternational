/**
 * Every message Reliance Bank sends, in one object.
 *
 * The registry key is also the event name the rest of the API publishes against, so there
 * is no second table mapping "what happened" to "what we send" — a mapping that in every
 * codebase eventually grows an entry pointing at a template that no longer exists.
 *
 * The consequence worth stating: adding a message is adding one entry to one family file.
 * Nothing else in the platform needs to learn about it.
 */

import { type NotificationCategory, type NotificationChannel } from '@reliance/contracts';

import { type EmailTemplate, type RenderedEmail, type TemplateLinks } from './define-template.js';
import { ACCOUNT_SECURITY_TEMPLATES } from './families/account-security.templates.js';
import { ACCOUNT_TEMPLATES } from './families/accounts.templates.js';
import { CARD_TEMPLATES } from './families/cards.templates.js';
import { COLLECTION_TEMPLATES } from './families/collections.templates.js';
import { LENDING_SERVICING_TEMPLATES } from './families/lending-servicing.templates.js';
import { LENDING_TEMPLATES } from './families/lending.templates.js';
import { ONBOARDING_TEMPLATES } from './families/onboarding.templates.js';
import { PAYMENT_TEMPLATES } from './families/payments.templates.js';
import { RELATIONSHIP_TEMPLATES } from './families/relationship.templates.js';
import { SAVINGS_TEMPLATES } from './families/savings.templates.js';
import { SECURITY_TEMPLATES } from './families/security.templates.js';
import { SERVICING_TEMPLATES } from './families/servicing.templates.js';
import { SUPPORT_TEMPLATES } from './families/support.templates.js';

export const TEMPLATES = {
  ...ONBOARDING_TEMPLATES,
  ...SECURITY_TEMPLATES,
  ...ACCOUNT_SECURITY_TEMPLATES,
  ...PAYMENT_TEMPLATES,
  ...COLLECTION_TEMPLATES,
  ...CARD_TEMPLATES,
  ...ACCOUNT_TEMPLATES,
  ...SERVICING_TEMPLATES,
  ...LENDING_TEMPLATES,
  ...LENDING_SERVICING_TEMPLATES,
  ...SAVINGS_TEMPLATES,
  ...SUPPORT_TEMPLATES,
  ...RELATIONSHIP_TEMPLATES,
} as const;

/** The name of a message. Also the name of the event that produces it. */
export type TemplateKey = keyof typeof TEMPLATES;

/** The props a given template expects. */
export type TemplateProps<TKey extends TemplateKey> =
  (typeof TEMPLATES)[TKey] extends EmailTemplate<infer TProps> ? TProps : never;

/** A template with its props type erased. Safe to iterate; not safe to call `render` on. */
export type AnyTemplate = (typeof TEMPLATES)[TemplateKey];

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function isTemplateKey(value: string): value is TemplateKey {
  return Object.hasOwn(TEMPLATES, value);
}

export function templateFor(key: TemplateKey): AnyTemplate {
  return TEMPLATES[key];
}

/**
 * Renders a message.
 *
 * The cast is the one place the registry's heterogeneity is reconciled. It is sound
 * because `TemplateProps<TKey>` is derived from the very entry being indexed — but
 * TypeScript cannot follow that through a mapped lookup, so it is asserted once here
 * rather than at each of the ninety call sites.
 */
export function renderTemplate<TKey extends TemplateKey>(
  key: TKey,
  props: TemplateProps<TKey>,
  links: TemplateLinks,
): RenderedEmail {
  const template = TEMPLATES[key] as EmailTemplate<TemplateProps<TKey>>;
  return template.render(props, links);
}

/** The category a message belongs to, which is what the preference matrix is keyed on. */
export function categoryOf(key: TemplateKey): NotificationCategory {
  return TEMPLATES[key].category;
}

/** Channels a message goes down when the customer has expressed no opinion. */
export function defaultChannelsFor(key: TemplateKey): readonly NotificationChannel[] {
  return TEMPLATES[key].channels;
}

/** True when a message must not be held for quiet hours or rolled into a digest. */
export function isUrgent(key: TemplateKey): boolean {
  return TEMPLATES[key].urgent;
}
