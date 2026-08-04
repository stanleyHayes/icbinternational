/**
 * Node → plain text.
 *
 * Every email goes out as `multipart/alternative`. The text part is not a courtesy: some
 * clients are configured to show it exclusively, gateways score a message that has none as
 * more likely to be unwanted, and a customer forwarding a payment confirmation into a
 * ticket wants readable text rather than a wall of markup.
 *
 * It is generated from the same nodes as the HTML, so the two cannot say different things.
 */

import { AmountDirection, Tone, type EmailNode } from './email-node.js';
import { BANK_IDENTITY } from './theme.js';

/** Width of the plain-text rule. Comfortably inside the 78-column convention. */
const RULE_WIDTH = 48;
const RULE = '—'.repeat(RULE_WIDTH);

const TONE_PREFIX: Readonly<Record<Tone, string>> = Object.freeze({
  [Tone.NEUTRAL]: 'Note',
  [Tone.POSITIVE]: 'Confirmed',
  [Tone.CAUTION]: 'Please check',
  [Tone.CRITICAL]: 'Important',
});

const DIRECTION_SIGN: Readonly<Record<AmountDirection, string>> = Object.freeze({
  [AmountDirection.CREDIT]: '+',
  [AmountDirection.DEBIT]: '-',
  [AmountDirection.PENDING]: '',
  [AmountDirection.NEUTRAL]: '',
});

const DIRECTION_NOTE: Readonly<Record<AmountDirection, string>> = Object.freeze({
  [AmountDirection.CREDIT]: ' (paid in)',
  [AmountDirection.DEBIT]: ' (paid out)',
  [AmountDirection.PENDING]: ' (pending)',
  [AmountDirection.NEUTRAL]: '',
});

/** Renders the full text alternative, footer included. */
export function renderText(input: {
  heading: string;
  nodes: readonly EmailNode[];
  preferencesUrl: string | null;
}): string {
  const body = input.nodes.map((node) => renderTextNode(node)).join('\n');

  return [
    BANK_IDENTITY.name.toUpperCase(),
    '',
    input.heading,
    '',
    body,
    '',
    RULE,
    `${BANK_IDENTITY.legalName}, ${BANK_IDENTITY.addressLine}`,
    BANK_IDENTITY.registration,
    BANK_IDENTITY.regulator,
    BANK_IDENTITY.protection,
    '',
    'We will never ask you for your full password, your PIN or a one-time code.',
    `If someone does, end the conversation and call us on ${BANK_IDENTITY.supportPhone}.`,
    input.preferencesUrl
      ? `Choose which emails you receive: ${input.preferencesUrl}`
      : 'We send this message to every customer because it concerns the security of your account.',
    '',
  ].join('\n');
}

/** One renderer per node kind, exhaustive by construction. */
type TextRenderers = {
  [K in EmailNode['kind']]: (node: Extract<EmailNode, { kind: K }>) => string;
};

const TEXT_RENDERERS: TextRenderers = {
  PARAGRAPH: (node) => `${node.text}\n`,
  SUBHEADING: (node) => `${node.text.toUpperCase()}\n`,
  DETAILS: (node) => `${node.rows.map(detailLine).join('\n')}\n`,
  AMOUNT: (node) =>
    `${node.label}: ${DIRECTION_SIGN[node.direction]}${node.value}${DIRECTION_NOTE[node.direction]}\n`,
  CALLOUT: (node) => `${TONE_PREFIX[node.tone]}: ${node.text}\n`,
  BULLETS: (node) => `${node.items.map(bulletLine).join('\n')}\n`,
  CODE: (node) => `${node.value}\n${node.caption}\n`,
  BUTTON: (node) => `${node.label}: ${node.url}\n`,
  DIVIDER: () => `${RULE}\n`,
  FOOTNOTE: (node) => `${node.text}\n`,
};

function detailLine(row: { label: string; value: string }): string {
  return `  ${row.label}: ${row.value}`;
}

function bulletLine(item: string): string {
  return `  * ${item}`;
}

function renderTextNode(node: EmailNode): string {
  const render = TEXT_RENDERERS[node.kind] as (candidate: EmailNode) => string;
  return render(node);
}
