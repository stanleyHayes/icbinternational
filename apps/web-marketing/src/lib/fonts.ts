import { Outfit } from 'next/font/google';

/**
 * Outfit is the whole brand — wordmark, headings, body and every figure on a rate table.
 *
 * Loaded as the variable font rather than a set of weights: the site uses 400 through 700
 * and shipping four static faces would cost more bytes than the single variable file. It
 * is exposed as a CSS variable so `globals.css` can thread it into the brand's own font
 * tokens; the design system reads those, never a utility class.
 */
export const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
  // The metric-adjusted fallback is what keeps the first paint from reflowing.
  fallback: ['system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial'],
});
