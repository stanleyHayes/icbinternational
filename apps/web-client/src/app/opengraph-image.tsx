import { ImageResponse } from 'next/og';

import { tokens } from '@reliance/ui';

import { BANK_NAME } from '@/lib/env';

/** Alt text for the shared preview. Read aloud where the image cannot be. */
export const alt = `${BANK_NAME} — Online Banking`;

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The share card for the banking host.
 *
 * This host is `noindex` and disallowed in `robots.txt`, so it may look odd to ship a share
 * card at all. It is here precisely because a link unfurler is not a crawler and does not
 * ask: paste an `app.` link into a chat and something will fetch it and render *whatever it
 * finds*. Without this, that is the sign-in page — its heading, its copy, and any text the
 * page happens to lead with.
 *
 * So the card is deliberate and deliberately empty of content: the bank's mark, its name,
 * and a line that tells someone they are looking at a sign-in link. Nothing about the
 * screen behind it, and nothing that changes when that screen does.
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
              background: tokens.color.green['500'],
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
                color: tokens.color.green['500'],
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: 9,
              }}
            >
              BANK
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#FFFFFF', fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>
            Online Banking
          </span>
          <span style={{ color: tokens.color.slate['200'], fontSize: 30, marginTop: 24 }}>
            Sign in to your accounts.
          </span>
        </div>
      </div>
    ),
    size,
  );
}
