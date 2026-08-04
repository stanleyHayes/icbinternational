'use client';

/**
 * The Reliance Bank mark and lockup, as inline SVG.
 *
 * Inline rather than an `<img>` for two reasons: it inherits `currentColor`, so the wordmark stays
 * legible when the customer switches to dark mode instead of turning navy-on-navy, and it costs no
 * request on the sign-in screen, which is the one page where first paint is the whole impression.
 *
 * Colours come from the brand's CSS custom properties, never from literal hex — `brand/README.md`
 * is explicit that `tokens/brand.tokens.json` is the source of truth.
 *
 * The gradient and clip ids are per-instance. Two copies of the mark on one page — a sidebar and a
 * dialog — would otherwise both point at the first one's `<defs>`, and whichever unmounted first
 * would take the other's gradient with it.
 */

import { useId } from 'react';

const SHIELD =
  'M32 3.2 55.4 12.6a2.2 2.2 0 0 1 1.4 2v17.7c0 13.9-9.6 24.3-23.6 29.3a2.4 2.4 0 0 1-1.6 0C17.6 56.6 8 46.2 8 32.3V14.6a2.2 2.2 0 0 1 1.4-2Z';

const MONOGRAM =
  'M21 13h13c6 0 10.5 4.5 10.5 10 0 4.6-2.9 8.4-7 9.7L46 41h-8.6l-7.6-8.1H27.5V41H21Zm6.5 6v8h6.1c2.3 0 4.2-1.8 4.2-4s-1.9-4-4.2-4Z';

const SWEEP = 'M-4 6 34-8 78 26 24 70Z';

interface ShieldProps {
  readonly gradientId: string;
  readonly clipId: string;
}

function Shield({ gradientId, clipId }: ShieldProps) {
  return (
    <>
      <defs>
        <linearGradient
          id={gradientId}
          x1="8"
          y1="4"
          x2="56"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="var(--rb-palette-navy-700)" />
          <stop offset="1" stopColor="var(--rb-palette-navy-900)" />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={SHIELD} />
        </clipPath>
      </defs>
      <path d={SHIELD} fill={`url(#${gradientId})`} />
      <g clipPath={`url(#${clipId})`} opacity=".16">
        <path d={SWEEP} fill="var(--rb-palette-navy-200)" />
      </g>
      <g transform="translate(-1.5 1)" fill="#FFFFFF" fillRule="evenodd">
        <path d={MONOGRAM} />
      </g>
      <rect x="20" y="46" width="24" height="3.6" rx="1.8" fill="var(--rb-palette-green-500)" />
    </>
  );
}

/** The shield on its own. Use where the name is already on screen — a sidebar, an avatar slot. */
export function BrandMark({ className }: { readonly className?: string }) {
  const base = useId();

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <Shield gradientId={`${base}-fill`} clipId={`${base}-clip`} />
    </svg>
  );
}

/**
 * The full lockup: shield and wordmark.
 *
 * @param title the accessible name. Given `null` the lockup is decorative, which is what you want
 * when it sits inside a link that already says where it goes.
 */
export function BrandLockup({
  className,
  title = 'Reliance Bank',
}: {
  readonly className?: string;
  readonly title?: string | null;
}) {
  const base = useId();
  const titleId = `${base}-title`;

  return (
    <svg
      viewBox="0 0 268 64"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      aria-labelledby={title ? titleId : undefined}
      focusable="false"
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <Shield gradientId={`${base}-fill`} clipId={`${base}-clip`} />
      <g fontFamily="var(--rb-font-display)">
        <text x="76" y="33" fontSize="24" fontWeight="800" letterSpacing="0.4" fill="currentColor">
          RELIANCE
        </text>
        <text
          x="77.5"
          y="50"
          fontSize="12"
          fontWeight="600"
          letterSpacing="7.6"
          fill="var(--rb-color-accent)"
        >
          BANK
        </text>
      </g>
    </svg>
  );
}
