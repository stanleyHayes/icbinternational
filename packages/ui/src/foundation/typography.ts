/**
 * Typography presets — the brand type scale as semantic styles.
 *
 * Outfit is the only typeface in the system, so hierarchy is carried by size, weight and tracking
 * rather than by mixing families. Components pick a *style* (`textStyle('heading-md')` semantics,
 * usually just `cn(TEXT_STYLE['heading-md'], ...)`) instead of composing `text-*` and `font-*`
 * utilities ad hoc, which is what keeps a caption a caption on every screen.
 */

import { TABULAR } from './styles.js';

/**
 * The preset map. Every value uses only token-backed utilities — `font-display`/`font-numeric`
 * resolve to the Outfit stacks from `brand.tokens.json`, `text-*` to the brand scale.
 */
export const TEXT_STYLE = {
  /** Marketing hero, the big balance figure. Display weight, tight tracking. */
  'display-lg': 'font-display text-5xl font-semibold tracking-tight text-fg',
  /** Page-level headline. */
  'display-md': 'font-display text-4xl font-semibold tracking-tight text-fg',
  /** Section headline. */
  'heading-lg': 'font-display text-3xl font-semibold tracking-tight text-fg',
  /** Sub-section headline, card titles on dense screens. */
  'heading-md': 'font-display text-2xl font-semibold text-fg',
  /** Component title — a card header, a dialog heading. */
  title: 'font-display text-xl font-semibold text-fg',
  /** Default reading text. */
  body: 'font-body text-base text-fg',
  /** Emphasised body — the important line in a paragraph. */
  'body-strong': 'font-body text-base font-medium text-fg',
  /** Secondary, supporting text. */
  caption: 'font-body text-sm text-fg-muted',
  /** Form labels and control labels. */
  label: 'font-body text-sm font-medium text-fg',
  /**
   * Figures that change in place — balances, countdowns, rates. Fixed-width digits are part of
   * the style, not an option: without them a live balance reflows its row on every update.
   */
  numeric: `font-numeric ${TABULAR} text-fg`,
  /** IBANs, references, API keys — the only place mono is legitimate. */
  code: 'font-mono text-sm text-fg',
} as const;

/** Name of a typography preset in {@link TEXT_STYLE}. */
export type TextStyle = keyof typeof TEXT_STYLE;
