/**
 * The vocabulary an email template is written in.
 *
 * Templates describe *what* they are saying — a paragraph, a set of transaction details,
 * a one-time code, a call to action — and never *how* it is drawn. That separation is what
 * lets one branded layout govern forty-odd messages, and what makes it possible to render
 * the same template as HTML for a mail client and as plain text for the multipart
 * alternative without writing either one twice.
 *
 * Pure data. No imports, nothing injectable, no rendering. The renderers consume it.
 */

/** Colour meaning applied to a callout or an amount. Never the only signal — see the renderers. */
export const Tone = {
  NEUTRAL: 'NEUTRAL',
  POSITIVE: 'POSITIVE',
  CAUTION: 'CAUTION',
  CRITICAL: 'CRITICAL',
} as const;
export type Tone = (typeof Tone)[keyof typeof Tone];

/** Which side of the customer's balance an amount falls on. */
export const AmountDirection = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  PENDING: 'PENDING',
  NEUTRAL: 'NEUTRAL',
} as const;
export type AmountDirection = (typeof AmountDirection)[keyof typeof AmountDirection];

export interface DetailRow {
  readonly label: string;
  readonly value: string;
}

export type EmailNode =
  | { readonly kind: 'PARAGRAPH'; readonly text: string }
  | { readonly kind: 'SUBHEADING'; readonly text: string }
  | { readonly kind: 'DETAILS'; readonly rows: readonly DetailRow[] }
  | {
      readonly kind: 'AMOUNT';
      readonly label: string;
      readonly value: string;
      readonly direction: AmountDirection;
    }
  | { readonly kind: 'CALLOUT'; readonly tone: Tone; readonly text: string }
  | { readonly kind: 'BULLETS'; readonly items: readonly string[] }
  | { readonly kind: 'CODE'; readonly value: string; readonly caption: string }
  | { readonly kind: 'BUTTON'; readonly label: string; readonly url: string }
  | { readonly kind: 'DIVIDER' }
  | { readonly kind: 'FOOTNOTE'; readonly text: string };

export const paragraph = (text: string): EmailNode => ({ kind: 'PARAGRAPH', text });

export const subheading = (text: string): EmailNode => ({ kind: 'SUBHEADING', text });

export const details = (rows: readonly DetailRow[]): EmailNode => ({ kind: 'DETAILS', rows });

/**
 * A monetary figure with its direction stated.
 *
 * `value` is already formatted — by `Money.format()` at the call site, never here. This
 * module has no arithmetic in it and must not acquire any.
 */
export const amount = (
  label: string,
  value: string,
  direction: AmountDirection = AmountDirection.NEUTRAL,
): EmailNode => ({ kind: 'AMOUNT', label, value, direction });

export const callout = (tone: Tone, text: string): EmailNode => ({ kind: 'CALLOUT', tone, text });

export const bullets = (items: readonly string[]): EmailNode => ({ kind: 'BULLETS', items });

export const code = (value: string, caption: string): EmailNode => ({
  kind: 'CODE',
  value,
  caption,
});

export const button = (label: string, url: string): EmailNode => ({ kind: 'BUTTON', label, url });

export const divider = (): EmailNode => ({ kind: 'DIVIDER' });

export const footnote = (text: string): EmailNode => ({ kind: 'FOOTNOTE', text });
