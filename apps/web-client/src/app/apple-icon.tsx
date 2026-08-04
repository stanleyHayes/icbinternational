import { ImageResponse } from 'next/og';

import { tokens } from '@reliance/ui';

import { BANK_NAME } from '@/lib/env';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Read aloud where the image cannot be. */
export const alt = BANK_NAME;

/**
 * The home-screen icon.
 *
 * This is the one that matters most here: a customer who adds their bank to the home
 * screen is choosing this app over the browser, and the icon is the whole of that
 * decision's surface.
 *
 * Drawn corner to corner with no rounded corners and no transparency, because iOS applies
 * its own mask and composites anything transparent onto black — a rounded source inside a
 * rounded mask leaves a dark rind around the edge.
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
