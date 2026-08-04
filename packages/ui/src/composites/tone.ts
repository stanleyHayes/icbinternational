/**
 * The tone vocabulary shared by Badge, StatusPill, Alert and Toast.
 *
 * One list, one set of class strings. If each component picked its own colours, "pending" would
 * be gold in the transaction list and amber in the toast that announced it, and the user would
 * reasonably conclude they are two different things.
 *
 * The class strings are written out in full rather than composed from the tone name because
 * Tailwind scans source text: `bg-${tone}-soft` produces no CSS at all.
 */

/** Semantic weight of a status indicator. */
export type Tone =
  | 'neutral'
  | 'accent'
  | 'credit'
  | 'debit'
  | 'pending'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

/** Tinted background with matching text — the default for badges and pills. */
export const SOFT_TONE: Readonly<Record<Tone, string>> = {
  neutral: 'bg-surface-sunken text-fg-muted',
  accent: 'bg-accent-soft text-accent',
  credit: 'bg-credit-soft text-credit',
  debit: 'bg-debit-soft text-debit',
  pending: 'bg-pending-soft text-pending',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

/** Solid fill. Reserved for counts and the one badge on a screen that must be seen. */
export const SOLID_TONE: Readonly<Record<Tone, string>> = {
  neutral: 'bg-surface-inverse text-fg-inverse',
  accent: 'bg-accent text-accent-fg',
  credit: 'bg-credit text-on-solid',
  debit: 'bg-debit text-on-solid',
  pending: 'bg-pending text-on-solid',
  success: 'bg-success text-on-solid',
  warning: 'bg-warning text-on-solid',
  danger: 'bg-danger-solid text-on-solid',
  info: 'bg-info text-on-solid',
};

/** Left border and tint for banners. */
export const BANNER_TONE: Readonly<Record<Tone, string>> = {
  neutral: 'border-border bg-surface-sunken text-fg',
  accent: 'border-accent bg-accent-soft text-fg',
  credit: 'border-credit bg-credit-soft text-fg',
  debit: 'border-debit bg-debit-soft text-fg',
  pending: 'border-pending bg-pending-soft text-fg',
  success: 'border-success bg-success-soft text-fg',
  warning: 'border-warning bg-warning-soft text-fg',
  danger: 'border-danger bg-danger-soft text-fg',
  info: 'border-info bg-info-soft text-fg',
};

/** The status dot. Colour alone never carries meaning — it always sits beside a text label. */
export const DOT_TONE: Readonly<Record<Tone, string>> = {
  neutral: 'bg-fg-subtle',
  accent: 'bg-accent',
  credit: 'bg-credit',
  debit: 'bg-debit',
  pending: 'bg-pending',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};
