'use client';

/**
 * Taking a fixed deposit back early.
 *
 * The penalty is fetched and shown as **money** before the customer confirms — not as a rate, not
 * as "an early withdrawal charge may apply", and never after the fact. A customer who breaks a
 * deposit and then discovers what it cost has been mis-sold something, whatever the terms said.
 *
 * The quote is a read, so it can be fetched the moment the customer opens the panel. Nothing
 * happens until the confirmation, which is step-up gated because it is irreversible.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { BreakDepositQuote, Deposit } from '@reliance/contracts';
import { Alert, Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  ConfirmAction,
  DetailList,
  MoneyCell,
  movementKeys,
  QueryPanel,
  Section,
  stepUpOptions,
  type ConfirmedAction,
  type Detail,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const BREAK_CONSEQUENCE =
  'The deposit ends today and the money goes back to your account, less the charge below. You will not earn the interest the rest of the term would have paid, and the deposit cannot be reopened at this rate.';

/** Props for {@link BreakDeposit}. */
export interface BreakDepositProps {
  readonly deposit: Deposit;
}

const PENALTY_NOTE =
  'Taken from the interest first, and from the principal only if the interest does not cover it.';

function quoteRows(quote: BreakDepositQuote): Detail[] {
  return [
    {
      id: 'principal',
      label: 'What you put in',
      value: <MoneyCell money={quote.principal} muted />,
    },
    {
      id: 'interest',
      label: 'Interest earned so far',
      value: <MoneyCell money={quote.interestEarned} muted />,
    },
    {
      id: 'penalty',
      label: 'What breaking it early costs',
      value: (
        <MoneyCell money={quote.penaltyAmount} negative signed srLabel="Early withdrawal charge" />
      ),
      note: PENALTY_NOTE,
    },
    {
      id: 'net',
      label: 'What you would get back',
      value: (
        <MoneyCell money={quote.netProceeds} size="lg" srLabel="Amount returned to your account" />
      ),
    },
  ];
}

/**
 * @example <BreakDeposit deposit={deposit} />
 */
export function BreakDeposit({ deposit }: BreakDepositProps) {
  const cache = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const quote = useQuery({
    queryKey: movementKeys.save.breakQuote(deposit.id),
    queryFn: async () => (await browserApi().save.breakQuote(deposit.id)).data,
  });

  const breakIt = useMutation({
    mutationFn: async ({ stepUpToken }: { readonly stepUpToken?: string }) => {
      await browserApi().save.break(deposit.id, stepUpOptions(stepUpToken));
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: movementKeys.save.all }),
        cache.invalidateQueries({ queryKey: queryKeys.accounts.all }),
      ]);
    },
  });

  return (
    <Section
      title="Take this money back early"
      description="Here is exactly what it would cost, before you decide."
    >
      <QueryPanel query={quote} skeletonRows={2}>
        {(data) => (
          <QuotedBreak
            quote={data}
            failure={breakIt.error}
            confirming={confirming}
            onOpen={() => setConfirming(true)}
            onClose={() => setConfirming(false)}
            onConfirm={(options) => breakIt.mutateAsync(options)}
          />
        )}
      </QueryPanel>
    </Section>
  );
}

/** The warning that belongs on screen before the button, not inside the dialog after it. */
function IrreversibleNotice() {
  return (
    <Alert tone="warning" title="This cannot be undone">
      Once a fixed deposit is broken it cannot be put back at the same rate. If you only need part
      of the money, it is usually cheaper to leave the deposit alone.
    </Alert>
  );
}

/** Props for {@link BreakConfirmation}. */
interface BreakConfirmationProps {
  readonly open: boolean;
  readonly quote: BreakDepositQuote;
  readonly onClose: () => void;
  readonly onConfirm: ConfirmedAction;
}

/** The last chance to read the penalty, repeated inside the dialog that applies it. */
function BreakConfirmation({ open, quote, onClose, onConfirm }: BreakConfirmationProps) {
  return (
    <ConfirmAction
      open={open}
      onClose={onClose}
      title="Break this deposit"
      consequence={BREAK_CONSEQUENCE}
      confirmLabel="Break the deposit"
      destructive
      stepUpReason="break a fixed deposit"
      onConfirm={onConfirm}
    >
      <div className="border-border bg-surface-sunken mt-4 rounded-md border p-4">
        <DetailList items={quoteRows(quote)} />
      </div>
    </ConfirmAction>
  );
}

/** Props for {@link QuotedBreak}. */
interface QuotedBreakProps {
  readonly quote: BreakDepositQuote;
  readonly failure: unknown;
  readonly confirming: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onConfirm: ConfirmedAction;
}

/** The penalty, the warning, and the button — in that order, deliberately. */
function QuotedBreak(props: QuotedBreakProps) {
  return (
    <div className="flex flex-col gap-4">
      <DetailList items={quoteRows(props.quote)} />
      <FormAlert error={props.failure} />
      <IrreversibleNotice />

      <div className="flex justify-end">
        <Button variant="danger" onClick={props.onOpen}>
          Break this deposit
        </Button>
      </div>

      <BreakConfirmation
        open={props.confirming}
        quote={props.quote}
        onClose={props.onClose}
        onConfirm={props.onConfirm}
      />
    </div>
  );
}
