'use client';

/**
 * What the customer is told once the batch is accepted.
 *
 * Announced rather than merely drawn, and specific: how many payments and how much, so the figure
 * can be checked against the file that produced it without opening anything else.
 */

import type { BulkTransfer } from '@reliance/contracts';
import { Alert, MoneyText } from '@reliance/ui';

/** Props for {@link BulkSentNotice}. */
export interface BulkSentNoticeProps {
  readonly batch: BulkTransfer;
}

/**
 * @example <BulkSentNotice batch={batch} />
 */
export function BulkSentNotice({ batch }: BulkSentNoticeProps) {
  return (
    <div role="status" aria-live="polite">
      <Alert tone="success" title="The batch has been accepted">
        <p>
          {batch.validRows} payments totalling{' '}
          <MoneyText
            amount={batch.totalAmount.amount}
            currency={batch.totalAmount.currency}
            muted
            srLabel="Total accepted"
          />{' '}
          are on their way. You can follow each one in your payment list.
        </p>
      </Alert>
    </div>
  );
}
