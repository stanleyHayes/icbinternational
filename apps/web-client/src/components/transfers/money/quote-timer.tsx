'use client';

/**
 * The visible life of a quote.
 *
 * A bar that drains and a figure that counts down, with the state also written in words — a
 * customer who cannot distinguish the green bar from the gold one still reads "expires in 0:12".
 * When it runs out the component says so and offers the only useful next step, which is a fresh
 * price rather than a retry of a dead one.
 *
 * The announcement fires once at expiry and not on every tick. Announcing a countdown second by
 * second makes the rest of the screen unusable with a screen reader.
 *
 * That announcement comes from a region mounted empty on the *first* render and filled later.
 * A live region that enters the DOM already containing its message announces nothing — assistive
 * technology reports changes to regions it was already watching — and the customer who depends on
 * it is precisely the one who must be told their price has gone.
 */

import { RefreshCw } from 'lucide-react';

import { Button, cn } from '@reliance/ui';

import { QUOTE_URGENT_SECONDS, type QuoteExpiry } from './use-quote-expiry';

const FULL_PERCENT = 100;

/** Props for {@link QuoteTimer}. */
export interface QuoteTimerProps {
  readonly expiry: QuoteExpiry;
  /** Total life of the quote in seconds, used to size the bar. */
  readonly windowSeconds: number;
  /** Prices it again. Shown once the quote has run out. */
  readonly onRequote: () => void;
  /** True while the fresh price is being fetched. */
  readonly requoting?: boolean;
  /** What is being priced — "exchange rate", "payment". Used in the sentence. */
  readonly subject?: string;
}

/** The sentence shown and announced once the price is gone. One source, so the two cannot drift. */
function expiredMessage(subject: string): string {
  return `This ${subject} has expired. Get a fresh one to see what it costs now.`;
}

/** What the customer sees once the price is gone. Not itself a live region — see the module note. */
function Expired({
  subject,
  requoting,
  onRequote,
}: Pick<QuoteTimerProps, 'onRequote' | 'requoting'> & { readonly subject: string }) {
  return (
    <div className="border-border bg-pending-soft flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
      <p className="text-fg text-sm">{expiredMessage(subject)}</p>
      <Button
        size="sm"
        variant="secondary"
        loading={requoting}
        onClick={onRequote}
        startIcon={<RefreshCw aria-hidden="true" className="size-4" />}
      >
        Get a new {subject}
      </Button>
    </div>
  );
}

/** The draining bar. Its accessible value is the time left, not a percentage. */
function RemainingBar({
  expiry,
  windowSeconds,
  subject,
}: Pick<QuoteTimerProps, 'expiry' | 'windowSeconds'> & { readonly subject: string }) {
  const raw = windowSeconds > 0 ? (expiry.remaining / windowSeconds) * FULL_PERCENT : 0;
  const percent = Math.max(0, Math.min(FULL_PERCENT, Math.round(raw)));

  return (
    <div
      role="progressbar"
      aria-label={`Time left on this ${subject}`}
      aria-valuemin={0}
      aria-valuemax={windowSeconds}
      aria-valuenow={expiry.remaining}
      aria-valuetext={`${expiry.label} left`}
      className="rounded-pill bg-border h-1.5 w-full overflow-hidden"
    >
      <div
        className={cn(
          'rounded-pill ease-standard h-full transition-[width] duration-(--rb-duration-base)',
          expiry.urgent ? 'bg-pending' : 'bg-accent',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/**
 * @example <QuoteTimer expiry={expiry} windowSeconds={60} onRequote={refresh} subject="rate" />
 */
export function QuoteTimer({
  expiry,
  windowSeconds,
  onRequote,
  requoting = false,
  subject = 'price',
}: QuoteTimerProps) {
  return (
    <>
      {/* Always mounted, empty until the quote dies. `sr-only` is absolutely positioned, so an
          empty region costs no space in the flex column this sits in. */}
      <p aria-live="polite" className="sr-only">
        {expiry.expired ? expiredMessage(subject) : ''}
      </p>

      {expiry.expired ? (
        <Expired subject={subject} requoting={requoting} onRequote={onRequote} />
      ) : (
        <div className="border-border bg-surface-sunken flex flex-col gap-2 rounded-md border px-4 py-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-fg-muted">This {subject} is held for you</span>
            <span
              className={cn('font-medium tabular-nums', expiry.urgent ? 'text-pending' : 'text-fg')}
            >
              {expiry.known ? `expires in ${expiry.label}` : 'expires shortly'}
            </span>
          </div>

          <RemainingBar expiry={expiry} windowSeconds={windowSeconds} subject={subject} />

          {expiry.urgent ? (
            <p className="text-fg-muted text-xs">
              Under {QUOTE_URGENT_SECONDS} seconds left. We will price it again if it runs out.
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
