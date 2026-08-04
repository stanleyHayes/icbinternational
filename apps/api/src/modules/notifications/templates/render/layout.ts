/**
 * The one layout every Reliance Bank email is set in.
 *
 * A bank's email is recognised before it is read. A customer who has learned what ours
 * looks like has a cheap, reliable way to spot one that is not ours, so the wordmark, the
 * navy header, the type and the regulatory footer are identical across all forty-odd
 * messages and are assembled here rather than repeated in each template.
 *
 * Structural choices, all forced by mail clients rather than taste:
 * - Tables and inline styles; a `<style>` block is stripped by Gmail's clipping and
 *   ignored outright by several corporate gateways.
 * - A preheader in hidden text, so the inbox preview says something useful instead of
 *   repeating the subject or leaking the first line of the footer.
 * - `role="presentation"` on every layout table, so a screen reader reads prose rather
 *   than announcing a five-column grid.
 */

import { type EmailNode } from './email-node.js';
import { escapeHtml, renderNode, safeUrl } from './render-nodes.js';
import { BANK_IDENTITY, CONTENT_WIDTH, EMAIL_THEME } from './theme.js';

/** Zero-width padding that stops the client pulling body text into the inbox preview. */
const INVISIBLE_SPACER = '&#8199;&#65279;&nbsp;';
/** Enough repetitions to fill the longest preview line any mail client renders. */
const SPACER_REPEATS = 30;

export interface LayoutInput {
  readonly subject: string;
  /** Inbox preview line. Never a repeat of the subject. */
  readonly preheader: string;
  readonly heading: string;
  readonly nodes: readonly EmailNode[];
  /** Where the customer manages what we send them. Absent on mandatory security mail. */
  readonly preferencesUrl: string | null;
}

/** Renders a complete, standalone HTML document. */
export function renderLayout(input: LayoutInput): string {
  return [
    '<!doctype html>',
    '<html lang="en-GB" dir="ltr" xmlns:v="urn:schemas-microsoft-com:vml">',
    renderHead(input.subject),
    `<body style="margin:0;padding:0;background:${EMAIL_THEME.slate100};">`,
    renderPreheader(input.preheader),
    renderShell(input),
    '</body>',
    '</html>',
  ].join('');
}

function renderHead(subject: string): string {
  return (
    '<head>' +
    '<meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    '<meta name="x-apple-disable-message-reformatting" />' +
    '<meta name="color-scheme" content="light" />' +
    `<title>${escapeHtml(subject)}</title>` +
    '</head>'
  );
}

/**
 * Hidden preview text.
 *
 * The run of zero-width spaces stops the client pulling the first visible words of the
 * body in after it, which is what produces those previews that read "… View in browser
 * Unsubscribe".
 */
function renderPreheader(preheader: string): string {
  const spacer = INVISIBLE_SPACER.repeat(SPACER_REPEATS);
  return (
    '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">' +
    `${escapeHtml(preheader)}${spacer}` +
    '</div>'
  );
}

function renderShell(input: LayoutInput): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${EMAIL_THEME.slate100};">` +
    '<tr><td align="center" style="padding:32px 16px;">' +
    `<table role="presentation" width="${CONTENT_WIDTH}" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:${CONTENT_WIDTH}px;">` +
    renderMasthead() +
    renderBody(input.heading, input.nodes) +
    renderFooter(input.preferencesUrl) +
    '</table></td></tr></table>'
  );
}

function renderMasthead(): string {
  return (
    `<tr><td style="background:${EMAIL_THEME.navy800};border-radius:${EMAIL_THEME.radius} ${EMAIL_THEME.radius} 0 0;padding:24px 32px;">` +
    `<span style="font-family:${EMAIL_THEME.fontStack};font-size:19px;font-weight:600;letter-spacing:-0.2px;color:${EMAIL_THEME.white};">` +
    `${escapeHtml(BANK_IDENTITY.name)}</span>` +
    '</td></tr>'
  );
}

function renderBody(heading: string, nodes: readonly EmailNode[]): string {
  const content = nodes.map((node) => renderNode(node)).join('');
  return (
    `<tr><td style="background:${EMAIL_THEME.white};padding:32px;">` +
    `<h1 style="font-family:${EMAIL_THEME.fontStack};font-size:24px;line-height:32px;font-weight:600;color:${EMAIL_THEME.navy900};margin:0 0 20px 0;">` +
    `${escapeHtml(heading)}</h1>` +
    content +
    '</td></tr>'
  );
}

function renderFooter(preferencesUrl: string | null): string {
  const small = `font-family:${EMAIL_THEME.fontStack};font-size:12px;line-height:19px;color:${EMAIL_THEME.slate500};margin:0 0 8px 0;`;

  const preferences = preferencesUrl
    ? `<p style="${small}"><a href="${escapeHtml(safeUrl(preferencesUrl))}" style="color:${EMAIL_THEME.navy600};">Choose which emails you receive</a></p>`
    : `<p style="${small}">We send this message to every customer because it concerns the security of your account.</p>`;

  return (
    `<tr><td style="background:${EMAIL_THEME.slate50};border-radius:0 0 ${EMAIL_THEME.radius} ${EMAIL_THEME.radius};border-top:1px solid ${EMAIL_THEME.slate200};padding:24px 32px;">` +
    `<p style="${small}">${escapeHtml(BANK_IDENTITY.legalName)} · ${escapeHtml(BANK_IDENTITY.addressLine)}</p>` +
    `<p style="${small}">${escapeHtml(BANK_IDENTITY.registration)} ${escapeHtml(BANK_IDENTITY.regulator)}</p>` +
    `<p style="${small}">${escapeHtml(BANK_IDENTITY.protection)}</p>` +
    `<p style="${small}">We will never ask you for your full password, your PIN or a one-time code. If someone does, end the conversation and call us on ${escapeHtml(BANK_IDENTITY.supportPhone)}.</p>` +
    preferences +
    '</td></tr>'
  );
}
