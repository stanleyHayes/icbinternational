import { cn } from '@reliance/ui';

import { formatBps, formatDate } from '@/lib/format';

/**
 * A published rate, quoted the way a bank publishes one.
 *
 * This replaces the tinted pill that used to sit above the hero headline. A pill with an
 * icon in it is a badge — it decorates a claim. A bank does not badge its savings rate; it
 * *quotes* it, and a quotation carries three things or it is not one: the figure, the basis
 * it is quoted on, and the date it took effect. Those are the parts a customer needs to
 * check the number against the rate card, and they are what the regulator expects beside a
 * rate anyway. So the device here is a hairline rule and a dated line of tabular figures —
 * a stamp, not a sticker.
 *
 * Rendering nothing for a missing rate is deliberate and load-bearing. `basisPoints` is
 * `null` whenever the build could not reach the bank, and a marketing page with no rate to
 * quote must simply not make the claim.
 */

const VARIANTS = {
  /** Above a hero headline, where the h1 carries the weight and this must not compete. */
  inline: {
    wrapper: 'gap-x-2 gap-y-1 items-baseline',
    figure: 'text-lg',
    meta: 'text-sm',
  },
  /** In a page header, where the rate is the headline fact of the page. */
  display: {
    wrapper: 'flex-col gap-1',
    figure: 'text-4xl',
    meta: 'text-sm',
  },
} as const;

interface RateQuoteProps {
  /** The rate in basis points, or `null` when none was published. */
  readonly basisPoints: number | null;
  /** How the rate must be quoted: `AER` for savings, `APR` for lending. */
  readonly unit: string;
  /** The terms the figure is quoted on, in the customer's words. */
  readonly basis: string;
  /** ISO date the rate took effect. */
  readonly effectiveFrom?: string;
  readonly variant?: keyof typeof VARIANTS;
}

export function RateQuote(props: RateQuoteProps) {
  const { basisPoints, unit, basis, effectiveFrom, variant = 'inline' } = props;

  if (basisPoints === null) return null;

  const scale = VARIANTS[variant];

  return (
    <p className={cn('border-border-strong flex flex-wrap border-t pt-3', scale.wrapper)}>
      <span className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'font-display text-fg rb-tabular font-semibold tracking-tight tabular-nums',
            scale.figure,
          )}
        >
          {formatBps(basisPoints)}
        </span>
        <span className={cn('text-accent font-semibold', scale.meta)}>{unit}</span>
      </span>

      <span className={cn('text-fg-muted', scale.meta)}>
        {basis}
        {effectiveFrom ? (
          <>
            <span aria-hidden className="text-fg-subtle px-1.5">
              ·
            </span>
            as at {formatDate(effectiveFrom)}
          </>
        ) : null}
      </span>
    </p>
  );
}
