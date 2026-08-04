import type { MetadataRoute } from 'next';

import { tokens } from '@reliance/ui';

import { BANK_NAME } from '@/lib/env';

const ICON_SIZE = '512x512';
const APPLE_ICON_SIZE = '180x180';

/**
 * The web app manifest for the console.
 *
 * An operator works in this all day, usually beside the customer app. Installing it gives
 * them a window with its own name and icon in the switcher instead of a third indistinct
 * browser tab.
 *
 * No `shortcuts`: which queue an operator should jump to depends on their permissions, and
 * a fixed list would offer most of the staff at least one link that 403s. The console's
 * root already resolves that per role — see `app/page.tsx`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BANK_NAME} Operations`,
    short_name: 'RB Operations',
    description: `Staff operations console for ${BANK_NAME}.`,
    start_url: '/',
    scope: '/',
    id: '/',
    display: 'standalone',
    background_color: tokens.color.navy['950'],
    theme_color: tokens.color.navy['900'],
    lang: 'en-GB',
    dir: 'ltr',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icon.svg', sizes: ICON_SIZE, type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: ICON_SIZE, type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/apple-icon', sizes: APPLE_ICON_SIZE, type: 'image/png', purpose: 'any' },
    ],
  };
}
