#!/usr/bin/env node
/**
 * Generates every colour-bearing artefact in `@reliance/ui` from `brand/tokens/brand.tokens.json`.
 *
 * The brand rule is "zero hard-coded hex outside the token file". A rule that depends on
 * discipline is a rule that decays, so the CSS is not hand-written at all — it is emitted here
 * and verified in CI with `--check`. If someone edits the generated CSS by hand, the check fails.
 *
 * Emits:
 *   src/foundation/brand.tokens.generated.json  verbatim mirror, so `tokens.ts` can import a file
 *                                               that lives inside the package `rootDir`
 *   src/styles/theme.css                        raw palette + theme-aware role variables
 *   src/styles/tailwind-theme.css               Tailwind 4 `@theme` block bound to those variables
 *
 * Usage: node scripts/build-theme-css.mjs [--check]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
const SOURCE = join(REPO_ROOT, 'brand', 'tokens', 'brand.tokens.json');

const tokens = JSON.parse(readFileSync(SOURCE, 'utf8'));

const BANNER = `/* AUTO-GENERATED from brand/tokens/brand.tokens.json — do not edit.
   Regenerate with: pnpm --filter @reliance/ui theme */\n`;

/* ------------------------------------------------------------------ helpers */

/** `--rb-palette-navy-700` — the raw brand colour, identical in every theme. */
const paletteName = (group, shade) =>
  shade === null ? `--rb-palette-${group}` : `--rb-palette-${group}-${shade}`;

/** Reference to a raw palette entry, e.g. `p('navy', 700)`. */
const p = (group, shade = null) => `var(${paletteName(group, shade)})`;

/**
 * Mixes in oklab rather than sRGB: sRGB mixing of a saturated brand colour with white
 * desaturates it into pastel mush, which is exactly what a "soft" badge background must not be.
 */
const mix = (colour, percent, into) => `color-mix(in oklab, ${colour} ${percent}%, ${into})`;

/** A tinted surface derived from a role variable, so it re-tints itself per theme. */
const soft = (role, percent = 14) => mix(`var(--rb-color-${role})`, percent, 'transparent');

const declarations = (entries, indent = '  ') =>
  entries.map(([name, value]) => `${indent}${name}: ${value};`).join('\n');

/* ------------------------------------------------------------------- palette */

/** Flattens `color.navy.700` and `color.semantic.credit` into `--rb-palette-*` declarations. */
function paletteDeclarations() {
  const out = [];
  for (const [group, scale] of Object.entries(tokens.color)) {
    for (const [shade, hex] of Object.entries(scale)) {
      out.push([group === 'semantic' ? paletteName(shade, null) : paletteName(group, shade), hex]);
    }
  }
  return out;
}

/* ------------------------------------------------------- non-colour primitives */

function primitiveDeclarations() {
  const { fontFamily, featureSettings, scale } = tokens.typography;
  return [
    ...Object.entries(fontFamily).map(([key, value]) => [`--rb-font-${key}`, value]),
    ['--rb-numeric-tabular', featureSettings.tabularNumerals],
    ...Object.entries(scale).map(([key, value]) => [`--rb-text-${key}`, value]),
    ...Object.entries(tokens.radius).map(([key, value]) => [`--rb-radius-${key}`, value]),
    ...Object.entries(tokens.shadow).map(([key, value]) => [`--rb-shadow-${key}`, value]),
    ['--rb-space-unit', tokens.spacing.unit],
    ['--rb-space-gutter', tokens.spacing.gutter],
    ['--rb-space-section-y', tokens.spacing.sectionY],
    ...Object.entries(tokens.motion.duration).map(([key, value]) => [`--rb-duration-${key}`, value]),
    ...Object.entries(tokens.motion.easing).map(([key, value]) => [`--rb-ease-${key}`, value]),
  ];
}

/* ----------------------------------------------------------------- semantics */

/**
 * Role → { light, dark }. Roles are the only names components are allowed to reference:
 * a component asks for `surface`, never for `navy-900`, so re-skinning is a token change.
 *
 * `white` and `black` are CSS keywords, not brand colours; using them keeps the "no hex outside
 * the token file" rule literally true without inventing a fake brand token for paper white.
 */
const ROLES = {
  canvas: { light: p('slate', 50), dark: p('navy', 950) },
  surface: { light: 'white', dark: p('navy', 900) },
  'surface-raised': { light: 'white', dark: p('navy', 800) },
  'surface-sunken': { light: p('slate', 100), dark: p('navy', 950) },
  'surface-inverse': { light: p('navy', 900), dark: p('slate', 50) },

  border: { light: p('slate', 200), dark: p('navy', 700) },
  'border-strong': { light: p('slate', 300), dark: p('navy', 600) },

  fg: { light: p('navy', 900), dark: p('slate', 50) },
  'fg-muted': { light: p('slate', 600), dark: p('slate', 300) },
  'fg-subtle': { light: p('slate', 500), dark: p('slate', 400) },
  'fg-inverse': { light: p('slate', 50), dark: p('navy', 950) },

  // Green is the only saturated colour in the system, so it carries primary action.
  accent: { light: p('green', 600), dark: p('green', 500) },
  'accent-hover': { light: p('green', 700), dark: p('green', 400) },
  'accent-active': { light: p('green', 800), dark: p('green', 300) },
  'accent-fg': { light: 'white', dark: p('navy', 950) },

  // Navy carries institutional weight — secondary surfaces, headers, the card art.
  ink: { light: p('navy', 700), dark: p('navy', 100) },
  'ink-hover': { light: p('navy', 800), dark: 'white' },

  // Money semantics. Fixed system-wide; the dark values are lifted for contrast, never re-hued.
  credit: { light: p('credit'), dark: p('green', 300) },
  debit: { light: p('debit'), dark: mix(p('debit'), 72, 'white') },
  pending: { light: p('gold', 600), dark: p('gold', 400) },

  /**
   * A solid destructive fill. The `danger` role is lifted in dark mode so red *text* stays
   * legible on navy; a button filled with that lifted red would then need dark text, which reads
   * as a warning rather than a destructive action. The fill therefore stays constant.
   */
  'danger-solid': { light: p('danger'), dark: p('danger') },
  /** Foreground for any solid non-accent fill. Constant, because the fill it sits on is. */
  'on-solid': { light: 'white', dark: 'white' },

  success: { light: p('success'), dark: p('green', 300) },
  danger: { light: p('danger'), dark: mix(p('danger'), 70, 'white') },
  warning: { light: p('warning'), dark: mix(p('warning'), 78, 'white') },
  info: { light: p('info'), dark: p('navy', 300) },

  focus: { light: p('green', 600), dark: p('green', 400) },
  skeleton: { light: p('slate', 200), dark: p('navy', 800) },
  overlay: { light: mix(p('navy', 950), 45, 'transparent'), dark: mix('black', 65, 'transparent') },
};

/** Roles that also need a low-alpha fill for badges, pills and meter tracks. */
const SOFT_ROLES = ['accent', 'ink', 'credit', 'debit', 'pending', 'success', 'danger', 'warning', 'info'];

function roleDeclarations(theme) {
  const base = Object.entries(ROLES).map(([role, value]) => [`--rb-color-${role}`, value[theme]]);
  const softs = SOFT_ROLES.map((role) => [`--rb-color-${role}-soft`, soft(role)]);
  return [...base, ...softs];
}

/* ------------------------------------------------------------------ theme.css */

const REDUCED_MOTION_DURATION = '1ms';

function themeCss() {
  const light = declarations(roleDeclarations('light'));
  const dark = declarations(roleDeclarations('dark'));
  const stillDurations = declarations(
    Object.keys(tokens.motion.duration).map((key) => [`--rb-duration-${key}`, REDUCED_MOTION_DURATION]),
  );

  return `${BANNER}
:root {
  color-scheme: light;

  /* Raw brand palette — theme-independent. */
${declarations(paletteDeclarations())}

  /* Type, shape, elevation, rhythm and motion. */
${declarations(primitiveDeclarations())}

  /* Semantic roles — light. */
${light}
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;

${declarations(roleDeclarations('dark'), '    ')}
  }
}

/* An explicit choice always beats the OS preference, in both directions, so these come last. */
:root[data-theme='dark'] {
  color-scheme: dark;

${dark}
}

:root[data-theme='light'] {
  color-scheme: light;

${light}
}

/* Collapsing durations rather than disabling transitions keeps state changes observable
   to assistive tech while removing the movement that triggers vestibular symptoms. */
@media (prefers-reduced-motion: reduce) {
  :root {
${stillDurations}
  }

  /* The skeleton shimmer loops forever — collapsing its duration alone would strobe. */
  *, ::before, ::after {
    animation-duration: ${REDUCED_MOTION_DURATION} !important;
    animation-iteration-count: 1 !important;
    transition-duration: ${REDUCED_MOTION_DURATION} !important;
  }
}

@layer base {
  html {
    font-family: var(--rb-font-body);
    -webkit-text-size-adjust: 100%;
  }

  body {
    margin: 0;
    background-color: var(--rb-color-canvas);
    color: var(--rb-color-fg);
  }

  /* Balances must not jitter by a pixel when a digit changes under a live update. */
  .rb-tabular {
    font-variant-numeric: tabular-nums;
    font-feature-settings: var(--rb-numeric-tabular);
  }
}
`;
}

/* --------------------------------------------------------- tailwind-theme.css */

/**
 * Motion primitives. Named here, not in components: an entrance that differs by 90ms between two
 * dialogs reads as two different products. `tailwind-preset.ts` carries the JS twin of this list.
 */
const ANIMATIONS = [
  ['--animate-fade-in', 'rb-fade-in var(--rb-duration-fast) var(--rb-ease-decelerate)'],
  ['--animate-scale-in', 'rb-scale-in var(--rb-duration-base) var(--rb-ease-spring)'],
  ['--animate-slide-up', 'rb-slide-up var(--rb-duration-base) var(--rb-ease-decelerate)'],
  ['--animate-skeleton', 'rb-skeleton var(--rb-duration-slow) var(--rb-ease-standard) infinite'],
];

const KEYFRAMES = [
  '@keyframes rb-fade-in { from { opacity: 0; } to { opacity: 1; } }',
  '@keyframes rb-scale-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }',
  '@keyframes rb-slide-up { from { opacity: 0; transform: translateY(0.5rem); } to { opacity: 1; transform: translateY(0); } }',
  '@keyframes rb-skeleton { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }',
].join('\n');

function tailwindThemeCss() {
  const colours = [
    ...paletteDeclarations().map(([name]) => [
      `--color-${name.replace('--rb-palette-', '')}`,
      `var(${name})`,
    ]),
    ...Object.keys(ROLES).map((role) => [`--color-${role}`, `var(--rb-color-${role})`]),
    ...SOFT_ROLES.map((role) => [`--color-${role}-soft`, `var(--rb-color-${role}-soft)`]),
  ];

  const rest = [
    ...Object.keys(tokens.typography.fontFamily).map((key) => [
      `--font-${key}`,
      `var(--rb-font-${key})`,
    ]),
    ...Object.keys(tokens.typography.scale).map((key) => [`--text-${key}`, `var(--rb-text-${key})`]),
    ...Object.keys(tokens.radius).map((key) => [`--radius-${key}`, `var(--rb-radius-${key})`]),
    ...Object.keys(tokens.shadow).map((key) => [`--shadow-${key}`, `var(--rb-shadow-${key})`]),
    ...Object.keys(tokens.motion.easing).map((key) => [`--ease-${key}`, `var(--rb-ease-${key})`]),
    ['--spacing-gutter', 'var(--rb-space-gutter)'],
    ['--spacing-section', 'var(--rb-space-section-y)'],
  ];

  const keyframes = KEYFRAMES.split('\n')
    .map((line) => `  ${line}`)
    .join('\n');

  return `${BANNER}
/* Tailwind 4 consumes design tokens as CSS variables. Import this after theme.css:
     @import '@reliance/ui/styles/theme.css';
     @import '@reliance/ui/styles/tailwind-theme.css'; */
@theme {
${declarations(colours)}

${declarations(rest)}

${declarations(ANIMATIONS)}

${keyframes}
}

/* Roles already follow the OS preference via theme.css, so \`dark:\` only needs to track the
   explicit choice — a system-mode user on a dark OS is already dark, attribute or not. */
@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));
`;
}

/* --------------------------------------------------------------------- write */

/**
 * The role vocabulary has to exist in TypeScript too, and a hand-kept copy of a generated list
 * is a copy that drifts. Emitting it means `ThemeRole` cannot name a role the CSS does not define.
 */
function themeRolesTs() {
  const list = (values) => values.map((value) => `  '${value}',`).join('\n');

  return `${BANNER}
/** Every semantic colour role defined by \`styles/theme.css\`. */
export const THEME_ROLES = [
${list(Object.keys(ROLES))}
] as const;

/** Roles that additionally expose a low-alpha \`-soft\` fill. */
export const SOFT_THEME_ROLES = [
${list(SOFT_ROLES)}
] as const;
`;
}

const OUTPUTS = [
  [join(PACKAGE_ROOT, 'src', 'foundation', 'brand.tokens.generated.json'), `${JSON.stringify(tokens, null, 2)}\n`],
  [join(PACKAGE_ROOT, 'src', 'foundation', 'theme-roles.generated.ts'), themeRolesTs()],
  [join(PACKAGE_ROOT, 'src', 'styles', 'theme.css'), themeCss()],
  [join(PACKAGE_ROOT, 'src', 'styles', 'tailwind-theme.css'), tailwindThemeCss()],
];

const checkOnly = process.argv.includes('--check');
let stale = false;

for (const [path, content] of OUTPUTS) {
  const label = relative(PACKAGE_ROOT, path);

  if (checkOnly) {
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      current = null;
    }
    if (current !== content) {
      stale = true;
      console.error(`stale: ${label} — run \`pnpm --filter @reliance/ui theme\``);
    }
    continue;
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  console.warn(`wrote ${label}`);
}

if (stale) process.exit(1);
