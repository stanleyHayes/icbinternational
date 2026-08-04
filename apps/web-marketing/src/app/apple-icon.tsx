import { ImageResponse } from 'next/og';

import { tokens } from '@reliance/ui';

import { BANK } from '@/content/site';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Read aloud where the image cannot be. */
export const alt = BANK.shortName;

/**
 * The home-screen icon.
 *
 * Deliberately not a copy of `icon.svg`, because iOS treats this file differently from a
 * favicon. The field is drawn corner to corner with no rounded corners of its own — iOS
 * applies its own mask, and a rounded source inside a rounded mask leaves a dark rind —
 * and nothing is transparent, which iOS would otherwise composite onto black.
 *
 * Generated rather than shipped as a PNG so the colours come from the same brand tokens
 * the site is built from and cannot drift from them.
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
            background: tokens.color.green['500'],
            marginTop: 14,
          }}
        />
      </div>
    ),
    size,
  );
}
