import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import type { ReactNode } from 'react';

import { BANK_NAME } from '@/lib/env';

import './globals.css';
import { Providers } from './providers';

/**
 * Outfit is the whole brand — wordmark, headings, body and the tabular figures on every balance.
 * Self-hosted through `next/font` so there is no third-party request on the sign-in screen and no
 * flash of a fallback face on a page whose first line is somebody's money.
 */
const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: { default: `${BANK_NAME} — Online Banking`, template: `%s · ${BANK_NAME}` },
  description:
    'Manage your current account, savings and cards, send money at home and abroad, and see exactly where your money goes.',
  applicationName: BANK_NAME,
  // A signed-in banking session has nothing a search engine should hold, and a cached snapshot of
  // one is a disclosure waiting to happen.
  robots: { index: false, follow: false, nocache: true },
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false, email: false, address: false },
};

/**
 * The browser chrome colour.
 *
 * The one place a literal hex is unavoidable: the value is read by the operating system before any
 * stylesheet exists, so `var(--rb-color-canvas)` cannot be used. These mirror `slate-50` and
 * `navy-950` in `brand/tokens/brand.tokens.json` and must be changed with them.
 */
const CHROME_LIGHT = '#F7F9FB';
const CHROME_DARK = '#04141F';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: CHROME_LIGHT },
    { media: '(prefers-color-scheme: dark)', color: CHROME_DARK },
  ],
};

/**
 * The document.
 *
 * `suppressHydrationWarning` on `<html>` is required, not cosmetic: the theme script sets
 * `data-theme` before React hydrates, so the server's markup and the browser's genuinely differ by
 * that one attribute, and that difference is the whole point of running the script early.
 */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en-GB" className={outfit.variable} suppressHydrationWarning>
      <body className="bg-canvas text-fg min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
