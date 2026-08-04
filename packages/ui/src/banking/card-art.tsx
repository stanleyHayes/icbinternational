/**
 * CardArt — the physical or virtual card, drawn.
 *
 * Rendered at the real ISO/IEC 7810 ID-1 aspect ratio (85.60 × 53.98 mm) so the thing on screen
 * matches the thing in the customer's hand. Navy carries the institutional weight; the green
 * foundation bar is the only saturated element, exactly as in the mark.
 *
 * **It never renders a full card number.** The component accepts `last4` and nothing else, which
 * makes it structurally impossible for a screen to leak a PAN through the card visual — a rule
 * that has to be enforced by the type, because "we will only pass the last four" is not a control.
 */

import { cn } from '../lib/cn.js';

/** How the card exists. Virtual cards are shown flatter — there is no plastic to imply. */
export type CardMedium = 'physical' | 'virtual';

/** Product tier. Drives the accent, not the layout. */
export type CardTier = 'standard' | 'premium' | 'business';

export type CardNetwork = 'visa' | 'mastercard';

/** Icons inherit the card's text colour so a tier only has to change one class. */
const INHERIT = 'currentColor';

const TIER_SURFACE: Readonly<Record<CardTier, string>> = {
  standard: 'bg-linear-to-br from-navy-700 to-navy-950',
  premium: 'bg-linear-to-br from-navy-900 to-navy-950',
  business: 'bg-linear-to-br from-navy-800 via-navy-900 to-navy-950',
};

const TIER_ACCENT: Readonly<Record<CardTier, string>> = {
  standard: 'text-green-400',
  premium: 'text-gold-400',
  business: 'text-navy-200',
};

const NETWORK_LABEL: Readonly<Record<CardNetwork, string>> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
};

export interface CardArtProps {
  /** Cardholder name as embossed. */
  readonly holder: string;
  /** The last four digits. The only digits this component will ever accept. */
  readonly last4: string;
  /** `MM/YY`. */
  readonly expiry: string;
  readonly medium?: CardMedium;
  readonly tier?: CardTier;
  readonly network?: CardNetwork;
  /** Desaturates the card and states "Frozen" in words. */
  readonly frozen?: boolean;
  readonly className?: string;
}

/** The shield mark, simplified for small sizes. Inherits colour from its container. */
function ShieldMark() {
  return (
    <svg viewBox="0 0 24 28" aria-hidden="true" className="h-7 w-6">
      <path
        d="M12 1 22 5v10c0 6-4.3 10.4-10 12C6.3 25.4 2 21 2 15V5Z"
        fill={INHERIT}
        fillOpacity="0.16"
        stroke={INHERIT}
        strokeWidth="1.25"
      />
      <path d="M6 19.5h12" stroke={INHERIT} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** The EMV contact plate. Decorative — it is what makes the rectangle read as a card. */
function ChipGlyph() {
  return (
    <svg viewBox="0 0 32 24" aria-hidden="true" className="h-6 w-8 opacity-80">
      <rect x="0.5" y="0.5" width="31" height="23" rx="3.5" fill={INHERIT} fillOpacity="0.2" />
      <path
        d="M0 8h32M0 16h32M11 0v24M21 0v24"
        stroke={INHERIT}
        strokeOpacity="0.45"
        strokeWidth="1"
      />
    </svg>
  );
}

const FROZEN_LABEL = 'Frozen';

/** Masked number, holder and expiry — the embossed block along the bottom edge. */
function CardDetails({ holder, last4, expiry }: Pick<CardArtProps, 'holder' | 'last4' | 'expiry'>) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-lg tracking-[0.2em] tabular-nums">•••• {last4}</span>
        <span className="font-body truncate text-xs tracking-wider uppercase opacity-80">
          {holder}
        </span>
      </div>
      <div className="flex flex-col items-end text-right">
        <span className="font-body text-xs tracking-wider uppercase opacity-60">Expires</span>
        <span className="font-mono text-sm tabular-nums">{expiry}</span>
      </div>
    </div>
  );
}

/**
 * @example
 * <CardArt holder="J MENSAH" last4="4417" expiry="09/29" tier="premium" network="visa" />
 */
export function CardArt(props: CardArtProps) {
  const { holder, last4, expiry, medium = 'physical', tier = 'standard', network, frozen } = props;

  return (
    <div
      className={cn(
        'relative flex aspect-[85.6/53.98] w-full max-w-sm flex-col justify-between',
        'font-display text-on-solid rounded-xl p-5 select-none',
        TIER_SURFACE[tier],
        medium === 'physical' ? 'shadow-lg' : 'shadow-md ring-1 ring-white/10',
        frozen && 'opacity-80 grayscale-[60%]',
        props.className,
      )}
    >
      <div className="flex items-start justify-between">
        <span className={TIER_ACCENT[tier]}>
          <ShieldMark />
        </span>
        <span className="font-body text-xs tracking-widest uppercase opacity-70">
          {medium === 'virtual' ? 'Virtual' : NETWORK_LABEL[network ?? 'visa']}
        </span>
      </div>

      <span className={TIER_ACCENT[tier]}>
        <ChipGlyph />
      </span>

      <CardDetails holder={holder} last4={last4} expiry={expiry} />

      {frozen && (
        <span
          className={cn(
            'rounded-pill absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'bg-surface font-body text-fg px-3 py-1 text-sm font-medium',
          )}
        >
          {FROZEN_LABEL}
        </span>
      )}
    </div>
  );
}
