import { ImageResponse } from 'next/og';

import { BANK } from '@/content/site';

/** Alt text for the shared preview. Read aloud where the image cannot be. */
export const alt = 'Reliance Bank — banking you can stand on';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const NAVY = '#062036';
const GREEN = '#00C08B';
const SLATE = '#C3CEDB';

/**
 * The default share card.
 *
 * Built with `next/og` rather than shipped as a static file so the wordmark, the colours
 * and the strapline all come from the same constants the site uses. A share card that
 * disagrees with the brand is a share card nobody remembers to update.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: NAVY,
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
            background: GREEN,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: NAVY,
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          R
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: 'white', fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>
            RELIANCE
          </span>
          <span style={{ color: GREEN, fontSize: 15, fontWeight: 600, letterSpacing: 9 }}>
            BANK
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ color: 'white', fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>
          {BANK.tagline}
        </span>
        <span style={{ color: SLATE, fontSize: 30, marginTop: 24, maxWidth: 900 }}>
          No monthly fee. Interest paid monthly. Every rate and charge published in full.
        </span>
      </div>
    </div>,
    size,
  );
}
