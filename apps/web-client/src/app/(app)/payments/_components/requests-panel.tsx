'use client';

/**
 * Asking somebody for money.
 *
 * A request is a link, not a demand: the other person opens it and chooses to pay. That is why the
 * screen leads with the shareable link rather than with the amount — the amount is already agreed
 * between two people, and the link is the thing that needs sending.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import type { CreatePaymentRequestRequest, PaymentRequest } from '@reliance/contracts';
import { Button, cn, StatusPill, Textarea } from '@reliance/ui';

import { EmptyPanel, FormAlert } from '@/components/shell';
import {
  AccountSelect,
  AmountField,
  laneRoutes,
  MoneyCell,
  movementKeys,
  QueryPanel,
  REQUEST_STATUS,
  Section,
  useUsableAccounts,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { relativeTime } from '@/lib/format';

const NOTE_MAX = 500;

const NO_REQUESTS = (
  <EmptyPanel
    title="You have not asked anyone for money"
    description="Create a request and send the link. Whoever you send it to can pay it from any bank."
  />
);

function RequestRow({ request }: { readonly request: PaymentRequest }) {
  const status = REQUEST_STATUS[request.status];

  return (
    <li>
      <Link
        href={laneRoutes.payments.request(request.id)}
        className={cn(
          'hover:bg-surface-sunken flex items-center justify-between gap-3 rounded-md px-3 py-3',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <span className="min-w-0">
          <span className="text-fg block truncate text-sm font-medium">
            {request.note ?? 'Payment request'}
          </span>
          <span className="text-fg-muted mt-0.5 block text-xs">
            Created {relativeTime(request.createdAt)}
            {request.paidByName ? ` · paid by ${request.paidByName}` : ''}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <StatusPill tone={status.tone} label={status.label} />
          <MoneyCell money={request.amount} srLabel="Amount requested" />
        </span>
      </Link>
    </li>
  );
}

/** Creates the request and refreshes the list it appears in. */
function useCreateRequest() {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreatePaymentRequestRequest) =>
      (await browserApi().payments.createRequest(body)).data,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.payments.all });
    },
  });
}

/** The form half: who pays into what, how much, and why. */
function NewRequest() {
  const accounts = useUsableAccounts();
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const create = useCreateRequest();

  const account = accounts.data?.find((candidate) => candidate.id === destinationAccountId);
  const ready = Boolean(destinationAccountId && amount);

  const submit = (): void => {
    if (!ready) return;
    create.mutate({
      destinationAccountId,
      amount: { amount, currency: account?.currency ?? 'GBP' },
      expiresInHours: EXPIRY_HOURS,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  };

  return (
    <Section title="Ask for money" description="We give you a link and a QR code to send on.">
      <div className="flex flex-col gap-5">
        <FormAlert error={create.error} />

        <AccountSelect
          label="Pay into"
          accounts={accounts.data ?? []}
          value={destinationAccountId}
          onChange={setDestinationAccountId}
          hideBalance
        />

        <AmountField
          label="How much"
          currency={account?.currency ?? 'GBP'}
          value={amount}
          onChange={setAmount}
        />

        <NoteField value={note} onChange={setNote} />
        <CreateRow disabled={!ready} pending={create.isPending} onSubmit={submit} />
      </div>
    </Section>
  );
}

const EXPIRY_HOURS = 72;

/**
 * @example <RequestsPanel />
 */
export function RequestsPanel() {
  const requests = useQuery({
    queryKey: movementKeys.payments.requests(),
    queryFn: async () => (await browserApi().payments.listRequests()).data,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <NewRequest />

      <Section title="Requests you have made" description="And whether they have been paid.">
        <QueryPanel
          query={requests}
          skeletonRows={2}
          isEmpty={(list) => list.length === 0}
          empty={NO_REQUESTS}
        >
          {(list) => (
            <ul className="divide-border -mx-3 flex flex-col divide-y">
              {list.map((request) => (
                <RequestRow key={request.id} request={request} />
              ))}
            </ul>
          )}
        </QueryPanel>
      </Section>
    </div>
  );
}

/** What the money is for. Optional, and it is what the other person sees. */
function NoteField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Textarea
      value={value}
      maxLength={NOTE_MAX}
      showCount
      aria-label="What the money is for"
      placeholder="What is it for? Dinner on Friday, share of the tickets…"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** The one action on the form. */
function CreateRow({
  disabled,
  pending,
  onSubmit,
}: {
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSubmit: () => void;
}) {
  return (
    <div className="flex justify-end">
      <Button disabled={disabled} loading={pending} onClick={onSubmit}>
        Create the request
      </Button>
    </div>
  );
}
