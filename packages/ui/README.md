# @reliance/ui

The Reliance Bank design system: brand tokens, accessible primitives, composites, and the banking
components that carry the brand's money semantics.

## Install into an app

```ts
// package.json
"@reliance/ui": "workspace:*"
```

```css
/* app.css — theme.css must come before tailwind-theme.css */
@import 'tailwindcss';
@import '@reliance/ui/styles/theme.css';
@import '@reliance/ui/styles/tailwind-theme.css';
```

Apps on a JavaScript Tailwind config can use the preset instead:

```ts
import { relianceTailwindPreset } from '@reliance/ui/tailwind-preset';

export default { presets: [relianceTailwindPreset] };
```

Both paths resolve to the same CSS custom properties, so they cannot disagree.

## The two rules

**Money is never a float.** Every amount crosses a component boundary as a string of integer minor
units — the same shape as `MoneyJSON.amount` — and becomes a `bigint` inside. `MoneyText` throws on
anything that is not `/^-?\d+$/`, including a float that slipped through an untyped API response.
Formatting is delegated to `@reliance/money`, which never materialises a JS number.

```tsx
<MoneyText amount="482350" currency="GBP" />   // £4,823.50
<MoneyText amount={4823.5} currency="GBP" />   // throws InvalidMinorUnitsError
```

**Colour meaning is fixed.** Credit is green, debit is `#D9534F`, pending is gold, zero is neutral —
in tables, in card art, and in charts. The mapping lives in `MONEY_ROLE` and `moneyDirection()`;
nothing else may pick its own money colours.

## Tokens

`brand/tokens/brand.tokens.json` is the single source of truth. Everything colour-bearing is
generated from it:

```
pnpm --filter @reliance/ui theme          # regenerate
pnpm --filter @reliance/ui theme:check    # fail if the generated files are stale (runs in lint)
```

Generated artefacts — do not edit by hand:

| File                                         | What it is                          |
| -------------------------------------------- | ----------------------------------- |
| `src/foundation/brand.tokens.generated.json` | verbatim mirror of the brand file   |
| `src/foundation/theme-roles.generated.ts`    | the role vocabulary, as TypeScript  |
| `src/styles/theme.css`                       | palette + light/dark semantic roles |
| `src/styles/tailwind-theme.css`              | Tailwind 4 `@theme` block           |

Components reference **roles** (`bg-surface`, `text-fg-muted`, `border-border`, `text-credit`),
never ramp shades and never a hex. Dark mode follows `prefers-color-scheme` and is overridden in
both directions by `:root[data-theme]`.

## Layout

```
src/foundation/   tokens, semantic roles, typography presets, dark mode, shared classes, icons
src/lib/          cn(), the minor-units guard
src/hooks/        controllable state, modal layer behaviour, ref merging
src/primitives/   Button Input Textarea Select Checkbox Radio Switch Label FieldError
                  OTPInput CurrencyInput FormField
src/composites/   Card Badge StatusPill Avatar Skeleton EmptyState ErrorState Alert Tabs
                  Dialog Drawer Tooltip Toast Table Pagination Stepper
src/banking/      MoneyText BalanceCard AccountCard TransactionRow CardArt LimitMeter
                  RateTicker ProgressRing
```

Every file is under 250 lines and every interactive component has an axe test.
