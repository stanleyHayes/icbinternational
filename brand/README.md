# Reliance Bank — Brand Kit

## The mark

A **shield** (custody, protection of deposits), a **white R monogram** (the institution), and a
**green foundation bar** (the ground the customer stands on — "reliance"). Navy carries the
institutional weight; the green is the only saturated colour in the system, so it is reserved for
money-positive states and primary actions.

| File                                | Use                                                                 |
| ----------------------------------- | ------------------------------------------------------------------- |
| `logo/reliance-mark.svg`            | App icon, avatars, favicon source, anywhere ≥ 24px square           |
| `logo/reliance-logo-horizontal.svg` | Default lockup — marketing header, emails, documents                |
| `logo/reliance-logo-onDark.svg`     | Navy / photographic / dark-mode backgrounds                         |
| `logo/reliance-logo-mono.svg`       | Single colour. Inherits `currentColor` — fax, embossing, watermarks |
| `logo/favicon.svg`                  | Browser tab, PWA icon (rounded-square container, heavier bar)       |

## Rules

- **Clear space** = the height of the foundation bar × 4 on every side.
- **Minimum size** — mark 20px, horizontal lockup 128px wide.
- Never re-colour the shield, stretch the lockup, add effects, or place the colour lockup on a
  background darker than `navy-300`. Use `onDark` instead.
- The wordmark in the SVGs is set in Outfit as live `<text>`. **Outline it to paths before any print
  or third-party export** so it does not fall back to Arial. Web use is fine — the font stack is
  loaded by the apps.

## Colour

| Token       | Hex       | Meaning                                       |
| ----------- | --------- | --------------------------------------------- |
| `navy-900`  | `#062036` | Primary ink, headings, shield base            |
| `navy-700`  | `#0B3A63` | Shield top, primary surfaces                  |
| `green-500` | `#00C08B` | Primary action, credits, positive movement    |
| `green-700` | `#00926A` | Green on light backgrounds (AA text contrast) |
| `gold-500`  | `#D8B54A` | Premium tier, pending states                  |
| `slate-*`   | —         | Neutral UI scale                              |

Money semantics are fixed system-wide: **credit = green, debit = `#D9534F`, pending = gold.** Never
invert them, including in charts.

## Type

**Outfit** is the single typeface for the entire brand — wordmark, marketing, product UI and
statements. One family, five weights, no mixing.

- **Display** — Outfit 600/700. Headlines, the wordmark, balance figures.
- **Body / UI** — Outfit 400/500.
- **Money & tabular data** — Outfit with `font-variant-numeric: tabular-nums`. Digits must not
  jitter when a balance updates.
- **Mono** — JetBrains Mono for IBANs, reference codes, API keys.

## Source of truth

`tokens/brand.tokens.json` is authoritative. `packages/ui` generates CSS custom properties and the
Tailwind theme from it. Do not hand-write hex values in app code — import the token.
