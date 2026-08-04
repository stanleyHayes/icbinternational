import type { MetadataRoute } from 'next';

import { BANK } from '@/content/site';

const ICON_SIZE = '512x512';

/** The web app manifest, so an installed shortcut carries the bank's own identity. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BANK.shortName} — ${BANK.tagline}`,
    short_name: BANK.shortName,
    description: BANK.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#04141F',
    theme_color: '#062036',
    lang: 'en-GB',
    categories: ['finance', 'business'],
    icons: [
      { src: '/icon.svg', sizes: ICON_SIZE, type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: ICON_SIZE, type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
