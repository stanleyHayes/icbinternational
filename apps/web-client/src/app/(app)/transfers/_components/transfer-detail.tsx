'use client';

/**
 * One payment, tracked.
 *
 * The timeline is the point. "Where is my money?" is answered by the sequence of things that have
 * happened to it and when, not by a single status word — a payment that says "on its way" and has
 * said so for two days is a payment somebody is about to telephone about.
 *
 * Cancelling is offered only while the payment is still inside the bank. Once the rail has it,
 * recall is a support case, and a button that pretends otherwise is a promise the bank cannot keep.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Transfer } from '@reliance/contracts';
import { Button, StatusPill } from '@reliance/ui';

import { FormAlert, LinkButton } from '@/components/shell';
import {
  CANCELLABLE_TRANSFER,
  ConfirmAction,
  laneRoutes,
  movementKeys,
  QueryPanel,
  Section,
  TRANSFER_STATUS,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

import { TransferReceipt } from './transfer-receipt';

const CANCEL_CONSEQUENCE =
  'The payment will not be sent and the money stays in your account. This cannot be undone, but you can always send it again.';

/** Props for {@link TransferDetail}. */
export interface TransferDetailProps {
  readonly transferId: string;
}

/** Every state the payment has passed through, oldest first. */
function Timeline({ transfer }: { readonly transfer: Transfer }) {
  return (
    <ol className="flex flex-col gap-4">
      {transfer.timeline.map((event) => (
        <li key={`${event.status}-${event.at}`} className="flex gap-3">
          <span aria-hidden="true" className="rounded-pill bg-accent mt-1.5 size-2 shrink-0" />
          <span className="min-w-0">
            <span className="text-fg block text-sm font-medium">
              {TRANSFER_STATUS[event.status].label}
            </span>
            <span className="text-fg-muted block text-sm">{event.detail}</span>
            <span className="text-fg-subtle block text-xs">{formatDateTime(event.at)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Cancels a payment that has not left the bank, and keeps the caches honest afterwards. */
function useCancelTransfer(transferId: string) {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await browserApi().transfers.cancel(transferId);
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: movementKeys.transfers.all }),
        cache.invalidateQueries({ queryKey: queryKeys.accounts.all }),
      ]);
    },
  });
}

function DetailBody({ transfer }: { readonly transfer: Transfer }) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useCancelTransfer(transfer.id);
  const status = TRANSFER_STATUS[transfer.status];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <Section
        title="Receipt"
        description="Everything the bank recorded about this payment."
        action={<StatusPill tone={status.tone} label={status.label} />}
      >
        <TransferReceipt transfer={transfer} />
        <FormAlert error={cancel.error} />

        <div className="border-border mt-5 flex flex-wrap gap-3 border-t pt-4">
          <LinkButton href={laneRoutes.transfers.index} variant="secondary">
            Send another payment
          </LinkButton>
          {CANCELLABLE_TRANSFER.has(transfer.status) ? (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Cancel this payment
            </Button>
          ) : null}
        </div>
      </Section>

      <Section title="What has happened so far">
        <Timeline transfer={transfer} />
      </Section>

      <ConfirmAction
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Cancel this payment"
        consequence={CANCEL_CONSEQUENCE}
        confirmLabel="Cancel the payment"
        destructive
        onConfirm={() => cancel.mutateAsync()}
      />
    </div>
  );
}

/**
 * @example <TransferDetail transferId={transferId} />
 */
export function TransferDetail({ transferId }: TransferDetailProps) {
  const transfer = useQuery({
    queryKey: movementKeys.transfers.detail(transferId),
    queryFn: async () => (await browserApi().transfers.get(transferId)).data,
  });

  return (
    <QueryPanel query={transfer} skeletonRows={4}>
      {(data) => <DetailBody transfer={data} />}
    </QueryPanel>
  );
}
