import type { MetadataRoute } from 'next';

import { tokens } from '@reliance/ui';

import { BANK_NAME } from '@/lib/env';
import { appRoutes } from '@/lib/routes';

const ICON_SIZE = '512x512';
const APPLE_ICON_SIZE = '180x180';

/**
 * The web app manifest.
 *
 * A customer who installs their bank gets a standalone window with the bank's own name,
 * icon and chrome colour rather than a browser tab wearing a generic globe.
 *
 * `start_url` is the root deliberately, not the dashboard: the root reads the session and
 * sends the customer to their accounts or to sign-in. Launching straight at `/dashboard`
 * would open an installed app on a redirect for anyone whose session had expired, which is
 * how a home-screen icon starts feeling broken.
 *
 * The shortcuts are the three things people open a banking app to do. Each is an ordinary
 * in-app route, so one behind authentication still lands correctly — via the root's session
 * check — rather than dead-ending.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BANK_NAME} — Online Banking`,
    short_name: BANK_NAME,
    description:
      'Manage your current account, savings and cards, send money at home and abroad, and see ' +
      'exactly where your money goes.',
    start_url: '/',
    scope: '/',
    id: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: tokens.color.navy['950'],
    theme_color: tokens.color.navy['900'],
    lang: 'en-GB',
    dir: 'ltr',
    categories: ['finance'],
    icons: [
      { src: '/icon.svg', sizes: ICON_SIZE, type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: ICON_SIZE, type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/apple-icon', sizes: APPLE_ICON_SIZE, type: 'image/png', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'Send money', short_name: 'Send', url: appRoutes.transfers },
      { name: 'Pay a bill', short_name: 'Pay', url: appRoutes.payments },
      { name: 'Your cards', short_name: 'Cards', url: appRoutes.cards },
    ],
  };
}
