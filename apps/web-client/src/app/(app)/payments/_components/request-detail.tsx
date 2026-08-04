'use client';

/**
 * One payment request, ready to send on.
 *
 * The link and the QR payload are the product. Both are copyable, and the whole card is printable
 * so a market stall or a charity table can put it on a counter.
 *
 * Cancelling is offered while the request is open, because a request left live after the money has
 * arrived some other way is a second payment waiting to happen.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { PaymentRequest } from '@reliance/contracts';
import { Button, StatusPill } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  ConfirmAction,
  CopyButton,
  DetailList,
  MoneyCell,
  movementKeys,
  QueryPanel,
  REQUEST_STATUS,
  Section,
  type Detail,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const CANCEL_CONSEQUENCE =
  'The link stops working straight away and nobody can pay it. Any payment already made is unaffected.';

/** Props for {@link RequestDetail}. */
export interface RequestDetailProps {
  readonly requestId: string;
}

function requestRows(request: PaymentRequest): Detail[] {
  return [
    {
      id: 'amount',
      label: 'Amount',
      value: <MoneyCell money={request.amount} size="lg" srLabel="Amount requested" />,
    },
    { id: 'note', label: 'What for', value: request.note ?? 'Not said' },
    {
      id: 'link',
      label: 'Link to send',
      value: (
        <span className="inline-flex items-center gap-1">
          <span className="truncate font-mono text-xs">{request.shareUrl}</span>
          <CopyButton value={request.shareUrl} subject="payment link" />
        </span>
      ),
    },
    {
      id: 'qr',
      label: 'QR payload',
      value: (
        <span className="inline-flex items-center gap-1">
          <span className="truncate font-mono text-xs">{request.qrPayload}</span>
          <CopyButton value={request.qrPayload} subject="QR payload" />
        </span>
      ),
      note: 'This is what a scanner reads. Scanning it opens the same request.',
    },
    { id: 'expires', label: 'Link expires', value: formatDateTime(request.expiresAt) },
  ];
}

/** Cancels the request and refreshes the list it came from. */
function useCancelRequest(requestId: string) {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await browserApi().payments.cancelRequest(requestId);
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.payments.all });
    },
  });
}

function DetailBody({ request }: { readonly request: PaymentRequest }) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useCancelRequest(request.id);
  const status = REQUEST_STATUS[request.status];

  return (
    <Section
      title="Your request"
      description="Send the link to whoever owes you. They can pay it from any bank."
      action={<StatusPill tone={status.tone} label={status.label} />}
    >
      <div className="flex flex-col gap-4">
        <DetailList items={requestRows(request)} />
        <FormAlert error={cancel.error} />

        {request.status === 'OPEN' ? (
          <div className="flex justify-end">
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Cancel this request
            </Button>
          </div>
        ) : null}

        <ConfirmAction
          open={confirming}
          onClose={() => setConfirming(false)}
          title="Cancel this request"
          consequence={CANCEL_CONSEQUENCE}
          confirmLabel="Cancel the request"
          destructive
          onConfirm={() => cancel.mutateAsync()}
        />
      </div>
    </Section>
  );
}

/**
 * @example <RequestDetail requestId={requestId} />
 */
export function RequestDetail({ requestId }: RequestDetailProps) {
  const request = useQuery({
    queryKey: movementKeys.payments.request(requestId),
    queryFn: async () => (await browserApi().payments.getRequest(requestId)).data,
  });

  return (
    <QueryPanel query={request} skeletonRows={3}>
      {(data) => <DetailBody request={data} />}
    </QueryPanel>
  );
}
