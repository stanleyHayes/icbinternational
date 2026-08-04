'use client';

/**
 * Asking for an arranged overdraft.
 *
 * Arranged is the operative word. The screen says what an arranged overdraft costs and what
 * happens if the account goes beyond it, because the gap between the two is where customers get
 * hurt and it is not something to leave to the terms.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { RequestOverdraftRequest } from '@reliance/api-client';
import type { Account } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';
import { Alert, Button, Textarea } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  AccountSelect,
  AmountField,
  movementKeys,
  Section,
  useUsableAccounts,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';

const REASON_MAX = 500;

const OVERDRAFT_BLURB =
  'A buffer on your current account for the days a payment lands before your pay does.';

/** Sends the request and refreshes the borrowing screens that will show it. */
function useRequestOverdraft(cache: ReturnType<typeof useQueryClient>) {
  return useMutation({
    mutationFn: async (body: RequestOverdraftRequest) =>
      (await browserApi().borrow.requestOverdraft(body)).data,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.borrow.all });
    },
  });
}

/**
 * @example <OverdraftForm />
 */
export function OverdraftForm() {
  const cache = useQueryClient();
  const accounts = useUsableAccounts();
  const [accountId, setAccountId] = useState('');
  const [limit, setLimit] = useState('');
  const [reason, setReason] = useState('');
  const request = useRequestOverdraft(cache);

  const currency =
    accounts.data?.find((candidate) => candidate.id === accountId)?.currency ?? 'GBP';

  const submit = (): void =>
    request.mutate({
      accountId,
      limit: { amount: limit, currency },
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });

  return (
    <Section title="Ask for an overdraft" description={OVERDRAFT_BLURB}>
      <div className="flex flex-col gap-5">
        <FormAlert error={request.error} />

        {request.isSuccess ? <RequestReceived /> : null}

        <OverdraftFields
          accounts={accounts.data ?? []}
          accountId={accountId}
          limit={limit}
          reason={reason}
          currency={currency}
          onAccount={setAccountId}
          onLimit={setLimit}
          onReason={setReason}
        />

        <CostNotice />

        <div className="flex justify-end">
          <Button disabled={!accountId || !limit} loading={request.isPending} onClick={submit}>
            Ask for this overdraft
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Why the customer wants it. Optional, and it genuinely helps the assessment. */
function FieldReason({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Textarea
      value={value}
      maxLength={REASON_MAX}
      showCount
      aria-label="Why you would like an overdraft"
      placeholder="Tell us briefly why you would like one. It is optional, and it helps."
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** The acknowledgement, announced rather than merely drawn. */
function RequestReceived() {
  return (
    <div role="status" aria-live="polite">
      <Alert tone="success" title="We have your request">
        We will let you know as soon as it has been assessed, usually within a working day.
      </Alert>
    </div>
  );
}

/** What an overdraft actually costs, before the customer asks for one. */
function CostNotice() {
  return (
    <Alert tone="info" title="What an overdraft costs">
      Interest is charged daily on whatever you are overdrawn by, at the rate shown on your account.
      Going beyond the arranged limit costs more and can be refused outright, so ask for the limit
      you actually need rather than the smallest one.
    </Alert>
  );
}

/** Props for {@link OverdraftFields}. */
interface OverdraftFieldsProps {
  readonly accounts: readonly Account[];
  readonly accountId: string;
  readonly limit: string;
  readonly reason: string;
  readonly currency: CurrencyCode;
  readonly onAccount: (accountId: string) => void;
  readonly onLimit: (limit: string) => void;
  readonly onReason: (reason: string) => void;
}

/** Which account, how big a buffer, and why. */
function OverdraftFields(props: OverdraftFieldsProps) {
  return (
    <>
      <AccountSelect
        label="Which account"
        accounts={props.accounts}
        value={props.accountId}
        onChange={props.onAccount}
      />

      <AmountField
        label="Limit you would like"
        currency={props.currency}
        value={props.limit}
        onChange={props.onLimit}
      />

      <FieldReason value={props.reason} onChange={props.onReason} />
    </>
  );
}
