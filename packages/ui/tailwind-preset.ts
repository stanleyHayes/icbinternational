/**
 * The Reliance Bank Tailwind preset.
 *
 * Tailwind 4 is CSS-first: the authoritative theme is the `@theme` block in
 * `src/styles/tailwind-theme.css`, generated from `brand/tokens/brand.tokens.json`. This module
 * exposes the same theme as a JavaScript object for the tools that still want one — the
 * `@config` escape hatch, IDE class-name intelligence, Storybook, and any app on the v3 bridge.
 *
 * Both paths resolve to the *same* CSS custom properties, so a token change moves them together
 * and neither can quietly disagree with the other. Nothing here contains a literal colour: every
 * value is a `var()` pointing at `theme.css`.
 *
 * @example
 * // Tailwind 4 (preferred)
 * // app.css
 * //   @import 'tailwindcss';
 * //   @import '@reliance/ui/styles/theme.css';
 * //   @import '@reliance/ui/styles/tailwind-theme.css';
 *
 * @example
 * // JavaScript config
 * import { relianceTailwindPreset } from '@reliance/ui/tailwind-preset';
 * export default { presets: [relianceTailwindPreset] };
 */

import { SOFT_THEME_ROLES, THEME_ROLES, tokens } from './src/foundation/tokens.js';

/** A `var()` reference to a raw palette entry — the brand colour, identical in every theme. */
const palette = (name: string): string => `var(--rb-palette-${name})`;

/** A `var()` reference to a semantic role — resolves differently in light and dark. */
const role = (name: string): string => `var(--rb-color-${name})`;

type Scale = Record<string, string>;

/** Maps every shade of every named ramp to its palette variable. */
function paletteColors(): Scale {
  const out: Scale = {};

  for (const [group, scale] of Object.entries(tokens.color)) {
    if (group === 'semantic') continue;

    for (const shade of Object.keys(scale)) {
      out[`${group}-${shade}`] = palette(`${group}-${shade}`);
    }
  }

  for (const name of Object.keys(tokens.color.semantic)) {
    out[`brand-${name}`] = palette(name);
  }

  return out;
}

/**
 * Maps the semantic roles. These are the names components use — `bg-surface`, `text-credit`,
 * `border-border` — and the reason no component references a ramp shade directly.
 */
function roleColors(): Scale {
  const out: Scale = {};

  for (const name of THEME_ROLES) out[name] = role(name);
  for (const name of SOFT_THEME_ROLES) out[`${name}-soft`] = role(`${name}-soft`);

  return out;
}

/** Turns a token record into `{ key: var(--rb-<prefix>-<key>) }`. */
function varsFrom(source: Readonly<Record<string, string>>, prefix: string): Scale {
  return Object.fromEntries(
    Object.keys(source).map((key) => [key, `var(--rb-${prefix}-${key})`]),
  ) as Scale;
}

/** Shape of the subset of the Tailwind config this preset populates. */
export interface RelianceTailwindPreset {
  readonly theme: {
    readonly extend: {
      readonly colors: Scale;
      readonly fontFamily: Record<string, string[]>;
      readonly fontSize: Scale;
      readonly borderRadius: Scale;
      readonly boxShadow: Scale;
      readonly spacing: Scale;
      readonly transitionDuration: Scale;
      readonly transitionTimingFunction: Scale;
      readonly keyframes: Record<string, Record<string, Record<string, string>>>;
      readonly animation: Scale;
    };
  };
}

/**
 * Font stacks arrive from the tokens as a single CSS string (`"'Outfit', system-ui, sans-serif"`)
 * because that is what a CSS variable needs; Tailwind's JS config wants an array.
 */
function fontFamilies(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(tokens.typography.fontFamily).map(([key, stack]) => [
      key,
      stack.split(',').map((part) => part.trim()),
    ]),
  );
}

/**
 * Motion the design system owns. `skeleton-pulse` is here rather than in a component because a
 * loading shimmer that differs between two screens reads as two different products.
 */
const KEYFRAMES: Record<string, Record<string, Record<string, string>>> = {
  'rb-fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
  'rb-scale-in': {
    from: { opacity: '0', transform: 'scale(0.96)' },
    to: { opacity: '1', transform: 'scale(1)' },
  },
  'rb-slide-up': {
    from: { opacity: '0', transform: 'translateY(0.5rem)' },
    to: { opacity: '1', transform: 'translateY(0)' },
  },
  'rb-skeleton': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.55' } },
};

const ANIMATIONS: Scale = {
  'fade-in': 'rb-fade-in var(--rb-duration-fast) var(--rb-ease-decelerate)',
  'scale-in': 'rb-scale-in var(--rb-duration-base) var(--rb-ease-spring)',
  'slide-up': 'rb-slide-up var(--rb-duration-base) var(--rb-ease-decelerate)',
  skeleton: 'rb-skeleton var(--rb-duration-slow) var(--rb-ease-standard) infinite',
};

/** The preset. Pass it to `presets: []`, or import the generated CSS and skip it entirely. */
export const relianceTailwindPreset: RelianceTailwindPreset = {
  theme: {
    extend: {
      colors: { ...paletteColors(), ...roleColors() },
      fontFamily: fontFamilies(),
      fontSize: varsFrom(tokens.typography.scale, 'text'),
      borderRadius: varsFrom(tokens.radius, 'radius'),
      boxShadow: varsFrom(tokens.shadow, 'shadow'),
      spacing: {
        gutter: 'var(--rb-space-gutter)',
        section: 'var(--rb-space-section-y)',
        unit: 'var(--rb-space-unit)',
      },
      transitionDuration: varsFrom(tokens.motion.duration, 'duration'),
      transitionTimingFunction: varsFrom(tokens.motion.easing, 'ease'),
      keyframes: KEYFRAMES,
      animation: ANIMATIONS,
    },
  },
};

export default relianceTailwindPreset;
