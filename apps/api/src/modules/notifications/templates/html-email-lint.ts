/**
 * A lint for rendered HTML email.
 *
 * "It looked fine in my browser" is not a standard an email can be held to — the message
 * is rendered by a dozen engines, several of which predate CSS as most people understand
 * it, and by clients that strip the parts of a document a browser would keep. These are
 * the rules that catch the failures that actually happen in an inbox.
 *
 * Run over every template's fixture render in the test suite, so a new message cannot be
 * merged with a `<style>` block or a naked `http://` link in it.
 */

/** Beyond this, Gmail clips the message and shows "[Message clipped]". */
export const GMAIL_CLIP_BYTES = 102_000;

/** Below this, some filters treat the message as image-only or empty. */
const MINIMUM_TEXT_CHARACTERS = 120;

export interface EmailLintFinding {
  readonly rule: string;
  readonly detail: string;
}

interface LintInput {
  readonly html: string;
  readonly text: string;
  readonly subject: string;
  readonly preheader: string;
}

interface Rule {
  readonly name: string;
  readonly check: (input: LintInput) => string | null;
}

const RULES: readonly Rule[] = Object.freeze([
  {
    name: 'no-style-element',
    check: ({ html }) =>
      /<style[\s>]/i.test(html)
        ? 'A <style> element is stripped by several corporate gateways. Use inline styles.'
        : null,
  },
  {
    name: 'no-script',
    check: ({ html }) =>
      /<script[\s>]/i.test(html)
        ? 'Script is removed by every mail client and flags the message.'
        : null,
  },
  {
    name: 'no-external-stylesheet',
    check: ({ html }) =>
      /<link[^>]+stylesheet/i.test(html)
        ? 'An external stylesheet will not load in an inbox.'
        : null,
  },
  {
    name: 'no-form',
    check: ({ html }) =>
      /<form[\s>]/i.test(html)
        ? 'Forms do not submit from an email and look broken when they fail.'
        : null,
  },
  {
    name: 'no-insecure-links',
    check: ({ html }) => {
      const insecure = /href="http:\/\/[^"]*"/i.exec(html);
      return insecure ? `Insecure link: ${insecure[0]}` : null;
    },
  },
  {
    name: 'images-have-alt',
    check: ({ html }) => {
      const images = html.match(/<img\b[^>]*>/gi) ?? [];
      const missing = images.find((tag) => !/\balt=/i.test(tag));
      return missing ? `Image without alt text: ${missing}` : null;
    },
  },
  {
    name: 'layout-tables-are-presentational',
    check: ({ html }) => {
      const tables = html.match(/<table\b[^>]*>/gi) ?? [];
      const unmarked = tables.find((tag) => !/role="presentation"/i.test(tag));
      return unmarked
        ? `Layout table not marked presentational, so a screen reader will announce it: ${unmarked}`
        : null;
    },
  },
  {
    name: 'declares-language',
    check: ({ html }) =>
      /<html[^>]+lang=/i.test(html) ? null : 'The document must declare its language.',
  },
  {
    name: 'has-title',
    check: ({ html }) =>
      /<title>[^<]+<\/title>/i.test(html) ? null : 'The document must have a title.',
  },
  {
    name: 'has-text-alternative',
    check: ({ text }) =>
      text.trim().length >= MINIMUM_TEXT_CHARACTERS
        ? null
        : 'The plain-text alternative is too short to stand on its own.',
  },
  {
    name: 'subject-is-reasonable-length',
    check: ({ subject }) => {
      if (subject.trim().length === 0) return 'The subject is empty.';
      return subject.length <= SUBJECT_MAX
        ? null
        : `Subject is ${subject.length} characters; it will be truncated.`;
    },
  },
  {
    name: 'preheader-adds-information',
    check: ({ subject, preheader }) => {
      if (preheader.trim().length === 0)
        return 'The preheader is empty, so the inbox preview leaks the footer.';
      return preheader.trim() === subject.trim()
        ? 'The preheader repeats the subject and wastes the preview line.'
        : null;
    },
  },
  {
    name: 'within-gmail-clip-limit',
    check: ({ html }) => {
      const bytes = Buffer.byteLength(html, 'utf8');
      return bytes <= GMAIL_CLIP_BYTES
        ? null
        : `Rendered to ${bytes} bytes; Gmail clips above ${GMAIL_CLIP_BYTES}.`;
    },
  },
  {
    name: 'no-unresolved-interpolation',
    check: ({ html, subject }) =>
      /\$\{|\{\{|undefined|\[object Object\]/.test(`${subject} ${html}`)
        ? 'The render contains an unresolved value. A prop is missing or misspelled.'
        : null,
  },
]);

/** Longest subject that survives an inbox list on a phone without being cut. */
const SUBJECT_MAX = 78;

/** Runs every rule. An empty array means the message is fit to send. */
export function lintEmail(input: LintInput): EmailLintFinding[] {
  const findings: EmailLintFinding[] = [];

  for (const rule of RULES) {
    const detail = rule.check(input);
    if (detail) findings.push({ rule: rule.name, detail });
  }

  return findings;
}
