/**
 * Every message the bank can send, rendered against its own fixture and linted.
 *
 * This is the acceptance criterion for the template library, and it is written to fail
 * loudly on a new template rather than quietly skip it: the suite iterates the registry,
 * so adding a message adds a test case automatically.
 */

import { NotificationCategory, NotificationChannel } from '@reliance/contracts';

import { type TemplateLinks } from '../templates/define-template.js';
import { lintEmail } from '../templates/html-email-lint.js';
import {
  TEMPLATES,
  TEMPLATE_KEYS,
  templateFor,
  type TemplateKey,
} from '../templates/template-registry.js';

const LINKS: TemplateLinks = {
  app: (path) => `https://app.reliancebank.example${path}`,
  site: (path) => `https://www.reliancebank.example${path}`,
  preferences: 'https://app.reliancebank.example/settings/notifications',
  help: 'https://www.reliancebank.example/help',
};

/** §4.6 — nothing on a rendered surface may disclose that this is not a live bank. */
const BANNED_COPY = [
  /\bsimulat(?:e|es|ed|ing|ion)\b/i,
  /\bdemos?\b/i,
  /\bsandbox\b/i,
  /\bfake\b/i,
  /\bmocked?\b/i,
  /\bdummy\b/i,
  /\blorem ipsum\b/i,
  /\btest (?:bank|account|mode|data)\b/i,
];

/** The library is required to be substantial; a regression that drops half of it should fail. */
const MINIMUM_TEMPLATES = 40;

describe('the template library', () => {
  it(`ships at least ${MINIMUM_TEMPLATES} messages`, () => {
    expect(TEMPLATE_KEYS.length).toBeGreaterThanOrEqual(MINIMUM_TEMPLATES);
  });

  it('has no duplicate keys across the families', () => {
    expect(new Set(TEMPLATE_KEYS).size).toBe(TEMPLATE_KEYS.length);
  });

  it('names every entry after itself, so the registry key and the template agree', () => {
    for (const key of TEMPLATE_KEYS) {
      expect(templateFor(key).key).toBe(key);
    }
  });
});

describe.each(TEMPLATE_KEYS)('%s', (key: TemplateKey) => {
  const rendered = templateFor(key).renderFixture(LINKS);

  it('renders against its fixture', () => {
    expect(rendered.subject.length).toBeGreaterThan(0);
    expect(rendered.summary.length).toBeGreaterThan(0);
    expect(rendered.html).toContain('Reliance Bank');
    expect(rendered.text).toContain('RELIANCE BANK');
  });

  it('passes the HTML-email lint', () => {
    const findings = lintEmail({
      html: rendered.html,
      text: rendered.text,
      subject: rendered.subject,
      preheader: rendered.preheader,
    });

    expect(findings).toEqual([]);
  });

  it('keeps to the product voice', () => {
    const surface = `${rendered.subject} ${rendered.preheader} ${rendered.summary} ${rendered.text}`;
    const offending = BANNED_COPY.find((pattern) => pattern.test(surface));

    expect(offending).toBeUndefined();
  });

  it('carries the regulatory footer', () => {
    expect(rendered.text).toContain('Financial Services Compensation Scheme');
    expect(rendered.text).toContain('Financial Conduct Authority');
  });

  it('never asks the customer for a credential', () => {
    // The footer's standing warning contains the phrase; the body must not ask for one.
    const body = rendered.text.split('We will never ask you')[0] ?? '';
    expect(body).not.toMatch(/\b(?:send|give|tell|confirm) us your (?:password|pin)\b/i);
  });
});

describe('security messages', () => {
  const securityKeys = TEMPLATE_KEYS.filter(
    (key) => templateFor(key).category === NotificationCategory.SECURITY,
  );

  it('exist', () => {
    expect(securityKeys.length).toBeGreaterThan(0);
  });

  it.each(securityKeys)(
    '%s omits the preference link, because it cannot be switched off',
    (key) => {
      const rendered = templateFor(key).renderFixture(LINKS);

      expect(rendered.html).not.toContain(LINKS.preferences);
      expect(rendered.text).toContain('concerns the security of your account');
    },
  );

  it.each(securityKeys)('%s reaches in-app and email at minimum', (key) => {
    const channels = templateFor(key).channels;

    expect(channels).toContain(NotificationChannel.IN_APP);
    expect(channels).toContain(NotificationChannel.EMAIL);
  });
});

describe('non-security messages', () => {
  const optionalKeys = TEMPLATE_KEYS.filter(
    (key) => templateFor(key).category !== NotificationCategory.SECURITY,
  );

  it.each(optionalKeys)('%s tells the customer how to change what they receive', (key) => {
    const rendered = templateFor(key).renderFixture(LINKS);
    expect(rendered.html).toContain(LINKS.preferences);
  });
});

describe('urgency', () => {
  it('is reserved for messages that lose their value if they arrive late', () => {
    const urgent = TEMPLATE_KEYS.filter((key) => templateFor(key).urgent);

    // A marketing message is never urgent, whatever anyone thinks of the campaign.
    const marketingUrgent = urgent.filter(
      (key) => TEMPLATES[key].category === NotificationCategory.MARKETING,
    );

    expect(marketingUrgent).toEqual([]);
    expect(urgent.length).toBeGreaterThan(0);
  });
});
