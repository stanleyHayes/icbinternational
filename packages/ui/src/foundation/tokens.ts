/**
 * Typed access to the Reliance Bank brand tokens.
 *
 * `brand/tokens/brand.tokens.json` is the single source of truth for every colour, typeface,
 * radius, shadow and motion value in the product. This module is the only place TypeScript is
 * allowed to see those raw values; components consume the semantic *roles* below instead, so a
 * re-skin is a token change rather than a sweep through two hundred component files.
 *
 * The `.generated.json` mirror exists purely so the import stays inside the package `rootDir`.
 * `scripts/build-theme-css.mjs --check` fails the build if it drifts from the brand file.
 */

import brandTokens from './brand.tokens.generated.json';
import { SOFT_THEME_ROLES, THEME_ROLES } from './theme-roles.generated.js';

/** A colour ramp keyed by numeric shade, e.g. `{ '500': '#00C08B' }`. */
export type ColorScale = Readonly<Record<string, string>>;

/** Colours whose meaning is fixed system-wide and must never be re-hued. */
export interface SemanticColorTokens {
  /** Money in. Green, always. */
  readonly credit: string;
  /** Money out. `#D9534F`, always. */
  readonly debit: string;
  /** Authorised but not settled. Gold, always. */
  readonly pending: string;
  readonly danger: string;
  readonly warning: string;
  readonly success: string;
  readonly info: string;
}

/** The full brand token document. */
export interface BrandTokens {
  readonly color: {
    readonly navy: ColorScale;
    readonly green: ColorScale;
    readonly gold: ColorScale;
    readonly slate: ColorScale;
    readonly semantic: SemanticColorTokens;
  };
  readonly typography: {
    readonly fontFamily: Readonly<Record<'display' | 'body' | 'mono' | 'numeric', string>>;
    readonly featureSettings: { readonly tabularNumerals: string };
    readonly scale: ColorScale;
  };
  readonly radius: Readonly<Record<string, string>>;
  readonly shadow: Readonly<Record<string, string>>;
  readonly spacing: { readonly unit: string; readonly gutter: string; readonly sectionY: string };
  readonly motion: {
    readonly duration: Readonly<Record<'instant' | 'fast' | 'base' | 'slow', string>>;
    readonly easing: Readonly<Record<'standard' | 'decelerate' | 'spring', string>>;
  };
}

/** The brand tokens, typed. */
export const tokens: BrandTokens = brandTokens;

export { SOFT_THEME_ROLES, THEME_ROLES };

/** Name of a semantic colour role defined by `styles/theme.css`. */
export type ThemeRole = (typeof THEME_ROLES)[number];

/** Roles that also expose a `-soft` low-alpha fill for badges, pills and meter tracks. */
export type SoftThemeRole = (typeof SOFT_THEME_ROLES)[number];

/**
 * CSS custom property for a semantic role, e.g. `roleVar('credit')` → `var(--rb-color-credit)`.
 *
 * Needed where a value must reach the DOM as an inline style rather than a class — SVG `stroke`
 * on a computed arc, a meter width, a gradient stop. Everywhere else, use the Tailwind utility.
 */
export function roleVar(role: ThemeRole | `${SoftThemeRole}-soft`): string {
  return `var(--rb-color-${role})`;
}

/** Direction of a monetary movement from the account holder's point of view. */
export type MoneyDirection = 'credit' | 'debit' | 'zero' | 'pending';

/**
 * The money colour contract, in one place.
 *
 * Credit is green, debit is `#D9534F`, pending is gold — in tables, in charts, in the card art,
 * everywhere. Zero is deliberately neutral: colouring a nil balance red implies a debit that did
 * not happen. Charts import this map rather than picking their own series colours.
 */
export const MONEY_ROLE: Readonly<Record<MoneyDirection, ThemeRole>> = Object.freeze({
  credit: 'credit',
  debit: 'debit',
  pending: 'pending',
  zero: 'fg-muted',
});
