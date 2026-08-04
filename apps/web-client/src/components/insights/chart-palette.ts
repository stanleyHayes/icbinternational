/**
 * Colours for the charts.
 *
 * Two rules, and they pull in different directions. The money colours are fixed system-wide —
 * credit green, debit `#D9534F`, pending gold — so a bar showing money in has to be the same
 * green as the figure beside it. But a spend donut needs a *categorical* palette, and a bank's
 * three brand colours cannot carry nineteen categories.
 *
 * So the categorical series use the Okabe–Ito palette: eight hues chosen to stay distinguishable
 * under protanopia, deuteranopia and tritanopia, which between them account for the large
 * majority of colour vision deficiency. They are declared as literal values rather than brand
 * tokens because that is exactly what they are — an accessibility constant, not a brand decision,
 * and re-hueing them to match a rebrand would break the property they were chosen for.
 *
 * Colour is never the only signal regardless: every chart in this directory ships with a table of
 * the same figures, and every slice and bar is labelled in text.
 */

import { roleVar } from '@reliance/ui';

/**
 * The Okabe–Ito qualitative palette.
 *
 * @see https://jfly.uni-koeln.de/color/ — Okabe & Ito, "Color Universal Design"
 */
export const CATEGORICAL_SERIES: readonly string[] = [
  '#0072B2',
  '#E69F00',
  '#009E73',
  '#CC79A7',
  '#56B4E9',
  '#D55E00',
  '#F0E442',
  '#7F7F7F',
];

/** Colour for the nth series, wrapping once the palette is exhausted. */
export function seriesColour(index: number): string {
  const palette = CATEGORICAL_SERIES;
  return palette[index % palette.length] ?? palette[0] ?? '#0072B2';
}

/**
 * The money colours, as CSS variables so they follow the light and dark themes.
 *
 * Charts read these rather than picking their own: a bar for money out that is not the same red
 * as the figure under it teaches the customer that the two mean different things.
 */
export const MONEY_SERIES = {
  in: roleVar('credit'),
  out: roleVar('debit'),
  pending: roleVar('pending'),
  balance: roleVar('accent'),
  axis: roleVar('fg-muted'),
  grid: roleVar('border'),
  surface: roleVar('surface'),
} as const;
