import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import type { ReactNode } from 'react';

import { tokens } from '@reliance/ui';

import { APP_URL, BANK_NAME } from '@/lib/env';

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

const DESCRIPTION =
  'Manage your current account, savings and cards, send money at home and abroad, and see exactly where your money goes.';

export const metadata: Metadata = {
  // Absolute base for the icon and Open Graph URLs below. Without it Next resolves them
  // against localhost and says so only as a build-time warning.
  metadataBase: new URL(APP_URL),
  title: { default: `${BANK_NAME} — Online Banking`, template: `%s · ${BANK_NAME}` },
  description: DESCRIPTION,
  applicationName: BANK_NAME,
  // A signed-in banking session has nothing a search engine should hold, and a cached snapshot of
  // one is a disclosure waiting to happen.
  robots: { index: false, follow: false, nocache: true },
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false, email: false, address: false },
  // Set even though nothing here is indexed: a link unfurler is not a crawler and does not
  // read `robots`. See `opengraph-image.tsx` for what it renders instead of the sign-in page.
  openGraph: {
    type: 'website',
    siteName: BANK_NAME,
    title: `${BANK_NAME} — Online Banking`,
    description: DESCRIPTION,
    url: APP_URL,
    locale: 'en_GB',
  },
  twitter: { card: 'summary_large_image' },
  // Names the installed app on an iOS home screen and drops the browser chrome when it
  // launches, matching what the manifest gives Android.
  appleWebApp: { capable: true, title: BANK_NAME, statusBarStyle: 'black-translucent' },
};

/**
 * The browser chrome colour.
 *
 * The one place a CSS custom property cannot be used: the value is read by the operating
 * system before any stylesheet exists, so `var(--rb-color-canvas)` is not resolvable yet.
 * Read from the brand tokens rather than written as a literal, so the address bar cannot
 * drift from the canvas it sits above — `brand/tokens/brand.tokens.json` stays the one
 * place either colour is decided.
 */
const CHROME_LIGHT = tokens.color.slate['50'];
const CHROME_DARK = tokens.color.navy['950'];

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
