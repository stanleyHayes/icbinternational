/**
 * How a message is declared.
 *
 * A template is one `compose` function from typed props to a composition — subject,
 * preview line, heading, a one-line summary and the body nodes. Everything else (the
 * masthead, the regulatory footer, the plain-text alternative, the in-app card, the SMS
 * text) is derived from that one function, so a message cannot say one thing in email and
 * a different thing in the notification centre.
 *
 * The template is also the event definition. There is no second catalogue mapping events
 * to templates: `TRANSFER_SENT` *is* the template, and it carries its own category,
 * severity and default channels. One name, one definition, nothing to keep in step.
 *
 * `renderFixture` exists for the lint suite. A registry of templates is a union of
 * differently-typed `compose` functions, and calling one across that union is not
 * type-safe from the outside — so each template closes over its own fixture at definition
 * time and exposes a nullary renderer instead.
 */

import {
  NotificationCategory,
  NotificationChannel,
  NotificationSeverity,
} from '@reliance/contracts';

import { type EmailNode } from './render/email-node.js';
import { renderLayout } from './render/layout.js';
import { renderText } from './render/render-text.js';

/** What a template's `compose` returns. */
export interface Composition {
  /** Inbox subject line. Specific, never a category name. */
  readonly subject: string;
  /** Inbox preview. Adds information the subject does not already carry. */
  readonly preheader: string;
  /** First line inside the email. */
  readonly heading: string;
  /** One line, used verbatim by the in-app centre, the SMS and the push payload. */
  readonly summary: string;
  readonly nodes: readonly EmailNode[];
  /** Deep link the in-app card and the push notification open. */
  readonly action?: { readonly label: string; readonly url: string };
}

export interface TemplateSpec<TProps> {
  readonly key: string;
  readonly category: NotificationCategory;
  /** Defaults to `INFO`. */
  readonly severity?: NotificationSeverity;
  /** Defaults to in-app plus email. */
  readonly channels?: readonly NotificationChannel[];
  /**
   * Bypasses quiet hours and digest batching.
   *
   * Reserve it for messages whose value collapses if they arrive late: a login from an
   * unrecognised device, a card authorisation the customer may need to stop, a failed
   * payment. A marketing message is never urgent, and neither is a statement.
   */
  readonly urgent?: boolean;
  /** Realistic props, used by the lint suite and by the template preview screen. */
  readonly fixture: TProps;
  readonly compose: (props: TProps, links: TemplateLinks) => Composition;
}

/**
 * Absolute destinations a template may point at.
 *
 * Templates never build a URL from a base string of their own. The three front ends move
 * between environments independently, and a template that hard-codes an origin is a link
 * that works in one of them. Everything goes through here.
 */
export interface TemplateLinks {
  /** Deep link into the customer's banking app, e.g. `app('/accounts')`. */
  readonly app: (path: string) => string;
  /** A page on the public site, e.g. `site('/security')`. */
  readonly site: (path: string) => string;
  readonly preferences: string;
  readonly help: string;
}

/** A rendered message, ready to hand to a channel. */
export interface RenderedEmail {
  readonly subject: string;
  readonly preheader: string;
  readonly summary: string;
  readonly html: string;
  readonly text: string;
  readonly action: { readonly label: string; readonly url: string } | null;
}

export interface EmailTemplate<TProps> {
  readonly key: string;
  readonly category: NotificationCategory;
  readonly severity: NotificationSeverity;
  readonly channels: readonly NotificationChannel[];
  readonly urgent: boolean;
  readonly compose: (props: TProps, links: TemplateLinks) => Composition;
  readonly render: (props: TProps, links: TemplateLinks) => RenderedEmail;
  /** Renders against the declared fixture. The lint suite's entry point. */
  readonly renderFixture: (links: TemplateLinks) => RenderedEmail;
}

const DEFAULT_CHANNELS: readonly NotificationChannel[] = Object.freeze([
  NotificationChannel.IN_APP,
  NotificationChannel.EMAIL,
]);

/**
 * Builds a template from its specification.
 *
 * @throws {RangeError} when the spec is internally inconsistent — an empty subject, or a
 *   body with nothing in it. Thrown at module load, so a malformed template cannot reach
 *   a running API.
 */
export function defineTemplate<TProps>(spec: TemplateSpec<TProps>): EmailTemplate<TProps> {
  const render = (props: TProps, links: TemplateLinks): RenderedEmail => {
    const composition = spec.compose(props, links);
    assertComplete(spec.key, composition);

    // Security mail carries no preference link: there is nothing on the other side of it
    // the customer can switch off, and offering the link would imply otherwise.
    const preferencesUrl = isMandatory(spec.category) ? null : links.preferences;

    return {
      subject: composition.subject,
      preheader: composition.preheader,
      summary: composition.summary,
      html: renderLayout({
        subject: composition.subject,
        preheader: composition.preheader,
        heading: composition.heading,
        nodes: composition.nodes,
        preferencesUrl,
      }),
      text: renderText({
        heading: composition.heading,
        nodes: composition.nodes,
        preferencesUrl,
      }),
      action: composition.action ?? null,
    };
  };

  return {
    key: spec.key,
    category: spec.category,
    severity: spec.severity ?? NotificationSeverity.INFO,
    channels: spec.channels ?? DEFAULT_CHANNELS,
    urgent: spec.urgent ?? false,
    compose: spec.compose,
    render,
    renderFixture: (links) => render(spec.fixture, links),
  };
}

function isMandatory(category: NotificationCategory): boolean {
  return category === NotificationCategory.SECURITY;
}

function assertComplete(key: string, composition: Composition): void {
  if (!composition.subject.trim())
    throw new RangeError(`Template ${key} composed an empty subject`);
  if (!composition.summary.trim())
    throw new RangeError(`Template ${key} composed an empty summary`);
  if (composition.nodes.length === 0) throw new RangeError(`Template ${key} composed no content`);
}
