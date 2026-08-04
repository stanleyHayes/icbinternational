import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { CookieBanner } from '@/components/layout/cookie-banner';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { JsonLdScript } from '@/components/seo/json-ld-script';
import { BANK, SITE_URL } from '@/content/site';
import { outfit } from '@/lib/fonts';
import { organisationJsonLd, websiteJsonLd } from '@/lib/seo/json-ld';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BANK.shortName} — ${BANK.tagline}`,
    template: `%s | ${BANK.shortName}`,
  },
  description: BANK.description,
  applicationName: BANK.shortName,
  authors: [{ name: BANK.legalName }],
  category: 'finance',
  keywords: [
    'current account',
    'savings account',
    'business banking',
    'personal loan',
    'mortgage',
    'multi-currency wallet',
  ],
  openGraph: {
    type: 'website',
    siteName: BANK.shortName,
    locale: 'en_GB',
    url: SITE_URL,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
  formatDetection: { telephone: true, address: false, email: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F9FB' },
    { media: '(prefers-color-scheme: dark)', color: '#04141F' },
  ],
};

/**
 * The shell every page renders inside.
 *
 * `suppressHydrationWarning` on `<html>` is required and narrow: next-themes writes the
 * resolved `data-theme` before React hydrates, so the server's markup and the client's
 * first pass legitimately differ by that one attribute and nothing else.
 */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en-GB" className={outfit.variable} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          <a
            href="#main"
            className="bg-accent text-accent-fg sr-only rounded-md px-4 py-2 font-medium focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-100"
          >
            Skip to main content
          </a>

          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <CookieBanner />
        </ThemeProvider>

        <JsonLdScript data={organisationJsonLd()} />
        <JsonLdScript data={websiteJsonLd()} />
      </body>
    </html>
  );
}
