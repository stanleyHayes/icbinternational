/**
 * Node → HTML fragment.
 *
 * Everything here is a table with inline styles, because that is what renders the same way
 * in Outlook, Gmail and Apple Mail. Three rules hold throughout:
 *
 * - **Colour is never the only signal.** A debit is red *and* carries a minus sign; a
 *   critical callout is red *and* prefixed with the word that says so. A customer reading
 *   this in a high-contrast client, or colour-blind, loses nothing.
 * - **Every string is escaped.** Template props carry customer-supplied text — a payee
 *   nickname, a reference — and an email is a rendering surface like any other.
 * - **Amounts arrive formatted.** No arithmetic happens in this file.
 */

import { AmountDirection, Tone, type EmailNode } from './email-node.js';
import { EMAIL_THEME } from './theme.js';

const CELL = `font-family:${EMAIL_THEME.fontStack};font-size:15px;line-height:24px;color:${EMAIL_THEME.slate800};`;
const MUTED = `font-family:${EMAIL_THEME.fontStack};font-size:13px;line-height:20px;color:${EMAIL_THEME.slate500};`;

/** Colour plus the word that carries the same meaning without it. */
const TONE_STYLE: Readonly<Record<Tone, { accent: string; background: string; prefix: string }>> =
  Object.freeze({
    [Tone.NEUTRAL]: { accent: EMAIL_THEME.info, background: EMAIL_THEME.navy50, prefix: 'Note' },
    [Tone.POSITIVE]: { accent: EMAIL_THEME.credit, background: '#E6FBF4', prefix: 'Confirmed' },
    [Tone.CAUTION]: { accent: EMAIL_THEME.warning, background: '#FDF6E7', prefix: 'Please check' },
    [Tone.CRITICAL]: { accent: EMAIL_THEME.danger, background: '#FBEDEC', prefix: 'Important' },
  });

/** URL schemes an anchor in a Reliance Bank email may point at. Nothing else is emitted. */
const PERMITTED_URL_SCHEMES = Object.freeze(['https:', 'mailto:', 'tel:']);

/**
 * Where a link goes when its URL is not one we are prepared to emit.
 *
 * A template prop can carry a URL assembled from stored data, and HTML-escaping does
 * nothing about `javascript:` or `data:` — escaping protects the *syntax* of the document,
 * not the *semantics* of a scheme. An unusable link is a far better outcome than a live
 * one pointing somewhere we did not intend.
 */
const BLOCKED_URL = 'https://www.reliancebank.example/security';

/** Sign and colour together, so neither carries the meaning alone. */
const DIRECTION_STYLE: Readonly<
  Record<AmountDirection, { colour: string; sign: string; note: string }>
> = Object.freeze({
  [AmountDirection.CREDIT]: { colour: EMAIL_THEME.credit, sign: '+', note: 'paid in' },
  [AmountDirection.DEBIT]: { colour: EMAIL_THEME.debit, sign: '−', note: 'paid out' },
  [AmountDirection.PENDING]: { colour: EMAIL_THEME.pending, sign: '', note: 'pending' },
  [AmountDirection.NEUTRAL]: { colour: EMAIL_THEME.slate800, sign: '', note: '' },
});

/** The five characters that can change the meaning of HTML text or a quoted attribute. */
const HTML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/**
 * Escapes a value for HTML text or a double-quoted attribute.
 *
 * This is an *encoder*, not a sanitiser: it does not try to decide which markup is
 * acceptable, it removes the possibility of markup entirely by replacing every character
 * that could open a tag, close an attribute or start an entity. One pass over a character
 * class, so there is no intermediate string in which an already-substituted entity could
 * be re-matched by a later rule.
 *
 * It says nothing about *where* the escaped value ends up — a URL still has to survive
 * {@link safeUrl}, because a well-formed `javascript:` href is perfectly valid HTML.
 */
export function escapeHtml(value: string): string {
  return value.replaceAll(/["&'<>]/g, (character) => HTML_ENTITIES[character] ?? character);
}

/**
 * Returns `url` if it is a scheme we are willing to emit, and a safe destination if not.
 *
 * @see PERMITTED_URL_SCHEMES
 */
export function safeUrl(url: string): string {
  try {
    return PERMITTED_URL_SCHEMES.includes(new URL(url).protocol) ? url : BLOCKED_URL;
  } catch {
    return BLOCKED_URL;
  }
}

/**
 * One renderer per node kind.
 *
 * A lookup rather than a `switch`: the table is exhaustive by construction — a new node
 * kind that is not given an entry is a type error — and each entry stays a one-expression
 * function instead of one arm of a ten-branch statement.
 */
type NodeRenderers = {
  [K in EmailNode['kind']]: (node: Extract<EmailNode, { kind: K }>) => string;
};

const RENDERERS: NodeRenderers = {
  PARAGRAPH: (node) => `<p style="${CELL}margin:0 0 16px 0;">${escapeHtml(node.text)}</p>`,
  SUBHEADING: (node) =>
    `<h2 style="font-family:${EMAIL_THEME.fontStack};font-size:17px;line-height:24px;color:${EMAIL_THEME.navy800};margin:24px 0 8px 0;font-weight:600;">${escapeHtml(node.text)}</h2>`,
  DETAILS: (node) => renderDetails(node.rows),
  AMOUNT: (node) => renderAmount(node.label, node.value, node.direction),
  CALLOUT: (node) => renderCallout(node.tone, node.text),
  BULLETS: (node) => renderBullets(node.items),
  CODE: (node) => renderCode(node.value, node.caption),
  BUTTON: (node) => renderButton(node.label, node.url),
  DIVIDER: () =>
    `<hr style="border:0;border-top:1px solid ${EMAIL_THEME.slate200};margin:24px 0;" />`,
  FOOTNOTE: (node) => `<p style="${MUTED}margin:0 0 12px 0;">${escapeHtml(node.text)}</p>`,
};

/** Renders one node. */
export function renderNode(node: EmailNode): string {
  const render = RENDERERS[node.kind] as (candidate: EmailNode) => string;
  return render(node);
}

function renderDetails(rows: readonly { label: string; value: string }[]): string {
  const body = rows
    .map(
      (row) =>
        `<tr>` +
        `<td style="${MUTED}padding:8px 16px 8px 0;white-space:nowrap;vertical-align:top;">${escapeHtml(row.label)}</td>` +
        `<td style="${CELL}padding:8px 0;text-align:right;font-variant-numeric:tabular-nums;">${escapeHtml(row.value)}</td>` +
        `</tr>`,
    )
    .join('');

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="border-collapse:collapse;background:${EMAIL_THEME.slate50};border:1px solid ${EMAIL_THEME.slate200};border-radius:${EMAIL_THEME.radius};margin:0 0 20px 0;">` +
    `<tr><td style="padding:8px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${body}</table></td></tr>` +
    `</table>`
  );
}

function renderAmount(label: string, value: string, direction: AmountDirection): string {
  const style = DIRECTION_STYLE[direction];
  const suffix = style.note ? ` <span style="${MUTED}">(${escapeHtml(style.note)})</span>` : '';

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px 0;">` +
    `<tr><td style="${MUTED}padding:0 0 4px 0;">${escapeHtml(label)}</td></tr>` +
    `<tr><td style="font-family:${EMAIL_THEME.fontStack};font-size:30px;line-height:38px;font-weight:600;color:${style.colour};font-variant-numeric:tabular-nums;">` +
    `${escapeHtml(style.sign)}${escapeHtml(value)}${suffix}</td></tr>` +
    `</table>`
  );
}

/**
 * A tinted box with a stated label.
 *
 * Deliberately not the accent-bar-down-one-side treatment. The label is what carries the
 * meaning — it survives a text-only client, a screen reader and a colour-blind reader
 * identically — and the tint is a quiet second signal rather than the whole message.
 */
function renderCallout(tone: Tone, text: string): string {
  const style = TONE_STYLE[tone];
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="border-collapse:collapse;background:${style.background};border:1px solid ${style.accent};border-radius:${EMAIL_THEME.radius};margin:0 0 20px 0;">` +
    `<tr><td style="${CELL}padding:14px 18px;">` +
    `<strong style="color:${style.accent};">${escapeHtml(style.prefix)}:</strong> ${escapeHtml(text)}` +
    `</td></tr></table>`
  );
}

function renderBullets(items: readonly string[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr><td style="${CELL}padding:0 0 8px 0;vertical-align:top;width:18px;">&bull;</td>` +
        `<td style="${CELL}padding:0 0 8px 0;">${escapeHtml(item)}</td></tr>`,
    )
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px 0;">${rows}</table>`;
}

function renderCode(value: string, caption: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px 0;">` +
    `<tr><td align="center" style="background:${EMAIL_THEME.navy50};border-radius:${EMAIL_THEME.radius};padding:20px;">` +
    `<div style="font-family:${EMAIL_THEME.monoStack};font-size:34px;line-height:42px;letter-spacing:8px;font-weight:600;color:${EMAIL_THEME.navy800};">${escapeHtml(value)}</div>` +
    `<div style="${MUTED}padding-top:8px;">${escapeHtml(caption)}</div>` +
    `</td></tr></table>`
  );
}

function renderButton(label: string, url: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px 0;">` +
    `<tr><td align="center" style="background:${EMAIL_THEME.navy700};border-radius:${EMAIL_THEME.radius};">` +
    `<a href="${escapeHtml(safeUrl(url))}" style="display:inline-block;padding:13px 28px;font-family:${EMAIL_THEME.fontStack};font-size:15px;font-weight:600;color:${EMAIL_THEME.white};text-decoration:none;">${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}
