/**
 * The document.
 *
 * Three things happen here and nowhere else: the brand's faces are loaded and bound to
 * the design system's font roles, the operator's saved theme is applied before the first
 * paint, and the provider tree is mounted. Everything else is the shell's job.
 *
 * The console is marked `noindex`: it is staff tooling behind authentication, and a
 * search engine has no business holding a copy of its titles.
 */

import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Outfit } from 'next/font/google';
import type { ReactNode } from 'react';

import { THEME_INIT_SCRIPT, tokens } from '@reliance/ui';

import { AppFrame } from '@/components/shell/app-frame';
import { BANK_NAME, CONSOLE_URL } from '@/lib/env';

import { Providers } from './providers';

import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  // Absolute base for the icon and Open Graph URLs. Without it Next resolves them against
  // localhost and reports it only as a build-time warning.
  metadataBase: new URL(CONSOLE_URL),
  title: {
    default: `Operations · ${BANK_NAME}`,
    template: `%s · Operations · ${BANK_NAME}`,
  },
  description: `Staff operations console for ${BANK_NAME}.`,
  robots: { index: false, follow: false, nocache: true },
  referrer: 'same-origin',
  applicationName: `${BANK_NAME} Operations`,
  formatDetection: { telephone: false, email: false, address: false },
  // Set despite `noindex`, because a chat unfurler reads neither that nor `robots.txt`.
  // See `opengraph-image.tsx` for why a fixed card beats whatever it would scrape.
  openGraph: {
    type: 'website',
    siteName: `${BANK_NAME} Operations`,
    title: `Operations · ${BANK_NAME}`,
    description: 'Staff access only.',
    url: CONSOLE_URL,
    locale: 'en_GB',
  },
  twitter: { card: 'summary_large_image' },
  appleWebApp: { capable: true, title: 'RB Operations', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // An operator on a shared workstation may need to zoom; a bank's console never
  // prevents that.
  maximumScale: 5,
  colorScheme: 'light dark',
  // The address bar and task-switcher colour. Read by the operating system before any
  // stylesheet exists, so it cannot come from a CSS variable — but it comes from the same
  // brand tokens the stylesheet is generated from, so the chrome cannot drift from the
  // canvas beneath it.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: tokens.color.slate['50'] },
    { media: '(prefers-color-scheme: dark)', color: tokens.color.navy['950'] },
  ],
};

/** Wraps every route in the console. */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en-GB"
      suppressHydrationWarning
      className={`${outfit.variable} ${jetBrainsMono.variable}`}
    >
      <head>
        {/* Runs before the stylesheet paints, so a returning operator who chose dark never
            sees a white flash on the way in. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}
