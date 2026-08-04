import { ImageResponse } from 'next/og';

import { tokens } from '@reliance/ui';

import { BANK_NAME } from '@/lib/env';

/** Alt text for the shared preview. Read aloud where the image cannot be. */
export const alt = `${BANK_NAME} Operations — staff sign-in`;

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The share card for the console.
 *
 * Operators paste console links to each other constantly — a ticket, an approval, a
 * customer. Whatever they paste into gets fetched and unfurled, and a link unfurler is not
 * a crawler: it does not read `robots.txt` and it does not honour `noindex`.
 *
 * So the question is not whether a preview is rendered, only what it contains. Left alone
 * it would be scraped from the page — which on this host means a queue, a customer name, or
 * an amount, rendered into a chat that may have a wider audience than the console does.
 * This card is fixed, contentless and identical for every URL: the mark, the console's
 * name, and nothing that varies with the screen behind it.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: tokens.color.navy['950'],
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: tokens.color.gold['500'],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: tokens.color.navy['950'],
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            R
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#FFFFFF', fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>
              RELIANCE
            </span>
            <span
              style={{
                color: tokens.color.gold['500'],
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: 6,
              }}
            >
              OPERATIONS
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#FFFFFF', fontSize: 68, fontWeight: 700, lineHeight: 1.05 }}>
            Operations console
          </span>
          <span style={{ color: tokens.color.slate['200'], fontSize: 30, marginTop: 24 }}>
            Staff access only. Sign in to continue.
          </span>
        </div>
      </div>
    ),
    size,
  );
}
