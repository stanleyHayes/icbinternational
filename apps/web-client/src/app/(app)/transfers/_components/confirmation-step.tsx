'use client';

/**
 * Step four: it is done.
 *
 * Confirmation is announced, not merely drawn — `role="status"` so a screen-reader user learns the
 * payment went through without hunting for a green tick. Then the three things somebody actually
 * does next: keep the receipt, pay the same person again, or go and track it.
 */

import { CheckCircle2, Printer } from 'lucide-react';

import type { Transfer } from '@reliance/contracts';
import { Button, MoneyText } from '@reliance/ui';

import { LinkButton } from '@/components/shell';
import { describeDestination, laneRoutes, Section } from '@/components/transfers';
import { formatDateTime } from '@/lib/format';

import { TransferReceipt } from './transfer-receipt';

/** Props for {@link ConfirmationStep}. */
export interface ConfirmationStepProps {
  readonly transfer: Transfer;
  /** Starts a fresh payment to the same payee, with the details already filled in. */
  readonly onRepeat: () => void;
}

/** The announcement, with the amount and the arrival estimate in one sentence. */
function SentBanner({ transfer, payee }: { readonly transfer: Transfer; readonly payee: string }) {
  const arrival = transfer.estimatedArrival
    ? `We expect it to arrive by ${formatDateTime(transfer.estimatedArrival)}.`
    : 'We will let you know as soon as it lands.';

  return (
    <div
      role="status"
      className="border-border bg-credit-soft flex items-start gap-3 rounded-lg border p-5"
    >
      <CheckCircle2 aria-hidden="true" className="text-credit mt-0.5 size-6 shrink-0" />
      <div>
        <h2 className="font-display text-fg text-xl font-semibold">
          Your payment to {payee} is on its way
        </h2>
        <p className="text-fg-muted mt-1 text-sm">
          <MoneyText
            amount={transfer.debitAmount.amount}
            currency={transfer.debitAmount.currency}
            muted
            srLabel="Amount sent"
          />{' '}
          left your account. {arrival}
        </p>
      </div>
    </div>
  );
}

/**
 * @example <ConfirmationStep transfer={transfer} onRepeat={startAgain} />
 */
export function ConfirmationStep({ transfer, onRepeat }: ConfirmationStepProps) {
  const payee = describeDestination(transfer.destination);

  const printAction = (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => globalThis.print()}
      startIcon={<Printer aria-hidden="true" className="size-4" />}
    >
      Print or save
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <SentBanner transfer={transfer} payee={payee} />

      <Section
        title="Receipt"
        description="Keep this, or send it on to whoever needs proof of the payment."
        action={printAction}
      >
        <TransferReceipt transfer={transfer} />
      </Section>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onRepeat}>
          Pay {payee} again
        </Button>
        <LinkButton href={laneRoutes.transfers.detail(transfer.id)} variant="secondary">
          Track this payment
        </LinkButton>
        <LinkButton href={laneRoutes.transfers.index} variant="ghost">
          Make another payment
        </LinkButton>
      </div>
    </div>
  );
}
