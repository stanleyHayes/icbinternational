'use client';

/**
 * Step three: the last screen before the money moves.
 *
 * The Send button is bound to the quote's life, not to the form's validity. While the price is
 * being fetched, re-fetched or has run out, there is nothing to send — so the control is disabled
 * and the timer says why. That is the whole guarantee: there is no state of this screen in which a
 * stale rate can be submitted.
 */

import { Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { QuoteTimer, Section } from '@/components/transfers';

import { QuoteSummary } from './quote-summary';
import type { TransferQuoteState } from './use-transfer-quote';

/** Props for {@link ReviewStep}. */
export interface ReviewStepProps {
  /** Who is being paid, in words. */
  readonly payeeName: string;
  readonly quoting: TransferQuoteState;
  readonly sending: boolean;
  /** True while the customer is being asked to prove it is them. */
  readonly authorising: boolean;
  readonly failure: unknown;
  readonly onBack: () => void;
  readonly onSend: () => void;
}

/**
 * @example <ReviewStep payeeName="James Mensah" quoting={quoting} onSend={send} … />
 */
export function ReviewStep({
  payeeName,
  quoting,
  sending,
  authorising,
  failure,
  onBack,
  onSend,
}: ReviewStepProps) {
  return (
    <Section title={`Send to ${payeeName}`} description="Check everything before you send.">
      <div className="flex flex-col gap-5">
        <FormAlert error={failure} />

        {quoting.error ? <FormAlert error={quoting.error} title="We could not price this" /> : null}

        {quoting.isLoading ? (
          <p role="status" className="text-fg-muted text-sm">
            Working out what this will cost…
          </p>
        ) : null}

        <PricePanel quoting={quoting} />

        <div className="flex flex-wrap justify-between gap-3">
          <Button variant="secondary" onClick={onBack} disabled={sending}>
            Change something
          </Button>
          <Button onClick={onSend} loading={sending} disabled={!quoting.usable}>
            {authorising ? 'Waiting for your confirmation' : 'Send this payment'}
          </Button>
        </div>

        <p className="text-fg-subtle text-xs">
          Nothing has left your account yet. Money sent to the wrong account is very hard to get
          back, so check the name and the account details one last time.
        </p>
      </div>
    </Section>
  );
}

/** The quote and the countdown that governs it, once there is one. */
function PricePanel({ quoting }: { readonly quoting: TransferQuoteState }) {
  if (!quoting.quote) return null;

  return (
    <>
      <QuoteSummary quote={quoting.quote} />
      <QuoteTimer
        expiry={quoting.expiry}
        windowSeconds={quoting.windowSeconds}
        onRequote={quoting.requote}
        requoting={quoting.isRefreshing}
        subject="price"
      />
    </>
  );
}
