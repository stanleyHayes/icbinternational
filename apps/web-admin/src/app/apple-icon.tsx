import { ImageResponse } from 'next/og';

import { tokens } from '@reliance/ui';

import { BANK_NAME } from '@/lib/env';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Read aloud where the image cannot be. */
export const alt = `${BANK_NAME} Operations`;

/**
 * The home-screen icon for the console.
 *
 * Carries the gold operations accent rather than the customer green, for the same reason
 * `icon.svg` does: an operator with both the console and the customer app saved will
 * otherwise have two identical icons and no way to tell which one they are opening.
 *
 * Drawn corner to corner with no rounded corners and no transparency — iOS applies its own
 * mask and composites transparency onto black.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage: `linear-gradient(135deg, ${tokens.color.navy['700']}, ${tokens.color.navy['900']})`,
          fontFamily: 'sans-serif',
        }}
      >
        <span style={{ color: '#FFFFFF', fontSize: 108, fontWeight: 700, lineHeight: 1 }}>R</span>
        <div
          style={{
            width: 74,
            height: 10,
            borderRadius: 5,
            background: tokens.color.gold['500'],
            marginTop: 14,
          }}
        />
      </div>
    ),
    size,
  );
}
