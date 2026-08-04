/**
 * The Reliance Bank lockup, inlined.
 *
 * Inline rather than an `<img>` so the wordmark inherits `currentColor` and stays legible
 * on the navy footer and in dark mode without a second asset, and so the header never
 * waits on a network round trip for the first thing a customer looks at.
 */

const VIEWBOX_WIDTH = 268;
const VIEWBOX_HEIGHT = 64;
const DEFAULT_HEIGHT = 32;
const ASPECT = VIEWBOX_WIDTH / VIEWBOX_HEIGHT;

const SHIELD_PATH =
  'M32 3.2 55.4 12.6a2.2 2.2 0 0 1 1.4 2v17.7c0 13.9-9.6 24.3-23.6 29.3a2.4 2.4 0 0 1-1.6 0' +
  'C17.6 56.6 8 46.2 8 32.3V14.6a2.2 2.2 0 0 1 1.4-2Z';

const MONOGRAM_PATH =
  'M21 13h13c6 0 10.5 4.5 10.5 10 0 4.6-2.9 8.4-7 9.7L46 41h-8.6l-7.6-8.1H27.5V41H21Z' +
  'm6.5 6v8h6.1c2.3 0 4.2-1.8 4.2-4s-1.9-4-4.2-4Z';

/** Shield, monogram and foundation bar — identical in both lockups. */
function ShieldGlyph() {
  return (
    <>
      <path d={SHIELD_PATH} className="fill-navy-700 dark:fill-navy-600" />
      <path d={MONOGRAM_PATH} fill="#FFFFFF" fillRule="evenodd" transform="translate(-1.5 1)" />
      <rect x="20" y="46" width="24" height="3.6" rx="1.8" className="fill-green-500" />
    </>
  );
}

/** The wordmark, set in the brand's display face and inheriting the surrounding colour. */
function Wordmark() {
  return (
    <>
      <text
        x="76"
        y="33"
        fontSize="24"
        fontWeight="800"
        letterSpacing="0.4"
        fill="currentColor"
        fontFamily="var(--rb-font-display)"
      >
        RELIANCE
      </text>
      <text
        x="77.5"
        y="50"
        fontSize="12"
        fontWeight="600"
        letterSpacing="7.6"
        className="fill-accent"
        fontFamily="var(--rb-font-display)"
      >
        BANK
      </text>
    </>
  );
}

export interface LogoProps {
  /** Rendered height in pixels. Width follows the lockup's aspect ratio. */
  readonly height?: number;
  /** `true` inside a link or heading that already names the bank, to avoid a double read. */
  readonly decorative?: boolean;
  readonly className?: string;
}

/**
 * @example <Logo height={36} />
 */
export function Logo({ height = DEFAULT_HEIGHT, decorative = false, className }: LogoProps) {
  const label = decorative ? undefined : 'Reliance Bank';

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      width={Math.round(height * ASPECT)}
      height={height}
      role={decorative ? 'presentation' : 'img'}
      aria-label={label}
      aria-hidden={decorative || undefined}
      focusable="false"
      className={className}
    >
      {!decorative && <title>Reliance Bank</title>}
      <ShieldGlyph />
      <Wordmark />
    </svg>
  );
}

/** The shield alone, for tight spaces such as the mobile drawer header. */
export function LogoMark({ height = 28, className }: Omit<LogoProps, 'decorative'>) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={height}
      height={height}
      role="presentation"
      aria-hidden
      focusable="false"
      className={className}
    >
      <ShieldGlyph />
    </svg>
  );
}
