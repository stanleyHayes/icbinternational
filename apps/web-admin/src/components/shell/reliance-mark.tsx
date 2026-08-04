/**
 * The Reliance shield.
 *
 * Inlined rather than loaded as an image so it inherits the page's theme, paints with
 * the first frame, and costs no request — the console renders it on every screen and on
 * the sign-in page, which is the first thing an operator sees each morning.
 *
 * Colours come straight from `brand/logo/reliance-mark.svg` and are the one place in this
 * app where a literal hex is correct: they are the mark, not a theme role.
 */

const SHIELD_PATH =
  'M32 3.2 55.4 12.6a2.2 2.2 0 0 1 1.4 2v17.7c0 13.9-9.6 24.3-23.6 29.3a2.4 2.4 0 0 1-1.6 0' +
  'C17.6 56.6 8 46.2 8 32.3V14.6a2.2 2.2 0 0 1 1.4-2Z';

const MONOGRAM_PATH =
  'M21 13h13c6 0 10.5 4.5 10.5 10 0 4.6-2.9 8.4-7 9.7L46 41h-8.6l-7.6-8.1H27.5V41H21Z' +
  'm6.5 6v8h6.1c2.3 0 4.2-1.8 4.2-4s-1.9-4-4.2-4Z';

export interface RelianceMarkProps {
  /** Rendered size in pixels, square. */
  readonly size?: number;
  readonly className?: string;
}

/** The bank's mark. Decorative here: the wordmark beside it carries the name. */
export function RelianceMark({ size = 28, className }: RelianceMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id="rb-shield" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0B3A63" />
          <stop offset="1" stopColor="#062036" />
        </linearGradient>
      </defs>
      <path d={SHIELD_PATH} fill="url(#rb-shield)" />
      <g transform="translate(-1.5 1)" fill="#FFFFFF" fillRule="evenodd">
        <path d={MONOGRAM_PATH} />
      </g>
      <rect x="20" y="46" width="24" height="3.6" rx="1.8" fill="#00C08B" />
    </svg>
  );
}
