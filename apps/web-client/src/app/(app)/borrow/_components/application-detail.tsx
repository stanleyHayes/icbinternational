'use client';

/**
 * One application, and its offer.
 *
 * The status tracker is the point of this screen: an application in underwriting is a thing people
 * check daily, and "submitted" with no sense of what happens next is what generates the phone
 * call. Where there is an offer, every figure in it is shown before the accept button — and the
 * button is step-up gated, because accepting an offer creates a debt.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { LoanApplication } from '@reliance/contracts';
import { Alert, Button, StatusPill } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import {
  ConfirmAction,
  DetailList,
  MoneyCell,
  movementKeys,
  QueryPanel,
  Section,
  stepUpOptions,
  type Detail,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { formatDate } from '@/lib/format';

import { AmortisationTable } from './amortisation-table';
import { APPLICATION_STATUS, aprLabel, OFFER_OPEN } from './lending-look';

const ACCEPT_CONSEQUENCE =
  'Accepting creates a loan in your name on the terms shown. The money is paid into the account you chose, and the repayments start on the first payment date.';

/** Props for {@link ApplicationDetail}. */
export interface ApplicationDetailProps {
  readonly applicationId: string;
}

function offerRows(application: LoanApplication): Detail[] {
  const { offer } = application;
  if (!offer) return [];

  return [
    {
      id: 'amount',
      label: 'Amount',
      value: <MoneyCell money={offer.amount} size="lg" srLabel="Amount offered" />,
    },
    { id: 'apr', label: 'Rate', value: `${aprLabel(offer.aprBps)} APR` },
    { id: 'term', label: 'Over', value: `${offer.termMonths} months` },
    {
      id: 'monthly',
      label: 'Each month',
      value: <MoneyCell money={offer.monthlyPayment} size="lg" srLabel="Monthly repayment" />,
    },
    {
      id: 'fee',
      label: 'Arrangement fee',
      value: <MoneyCell money={offer.arrangementFee} muted />,
    },
    {
      id: 'total',
      label: 'Total repayable',
      value: <MoneyCell money={offer.totalRepayable} muted />,
    },
    { id: 'first', label: 'First payment', value: formatDate(offer.firstPaymentDate) },
  ];
}

/** Accepts the offer, and refreshes the loan book it creates. */
function useAcceptOffer(applicationId: string) {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async ({ stepUpToken }: { readonly stepUpToken?: string }) => {
      await browserApi().borrow.acceptOffer(applicationId, stepUpOptions(stepUpToken));
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.borrow.all });
    },
  });
}

/** Why an application was declined, in the words underwriting gave. */
function DeclineReasons({ reasons }: { readonly reasons: readonly string[] }) {
  if (reasons.length === 0) return null;

  return (
    <Alert tone="warning" title="Why we could not approve this">
      <ul className="list-inside list-disc">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="mt-2">
        You can apply again once something has changed. Call us on 0800 460 0460 if you would like
        to talk it through.
      </p>
    </Alert>
  );
}

/** The offer, its schedule and the button that turns it into a debt. */
function OfferPanel({ application }: { readonly application: LoanApplication }) {
  const [confirming, setConfirming] = useState(false);
  const accept = useAcceptOffer(application.id);
  const { offer } = application;

  if (!offer || !OFFER_OPEN.has(application.status)) return null;

  return (
    <Section
      title="Your offer"
      description={
        application.offerExpiresAt
          ? `Open until ${formatDate(application.offerExpiresAt)}`
          : 'Open now'
      }
    >
      <div className="flex flex-col gap-4">
        <DetailList items={offerRows(application)} />
        <FormAlert error={accept.error} />

        <div className="flex justify-end">
          <Button onClick={() => setConfirming(true)}>Accept this offer</Button>
        </div>

        <AmortisationTable rows={offer.schedule} />

        <ConfirmAction
          open={confirming}
          onClose={() => setConfirming(false)}
          title="Accept this offer"
          consequence={ACCEPT_CONSEQUENCE}
          confirmLabel="Accept and take the loan"
          stepUpReason="accept a loan offer"
          onConfirm={(options) => accept.mutateAsync(options)}
        />
      </div>
    </Section>
  );
}

function DetailBody({ application }: { readonly application: LoanApplication }) {
  const status = APPLICATION_STATUS[application.status];

  return (
    <div className="flex flex-col gap-6">
      <Section
        title={application.purpose}
        description={`Applied for ${application.termMonths} months`}
        action={<StatusPill tone={status.tone} label={status.label} />}
      >
        <DetailList
          items={[
            {
              id: 'requested',
              label: 'Amount applied for',
              value: <MoneyCell money={application.requestedAmount} srLabel="Amount applied for" />,
            },
            {
              id: 'submitted',
              label: 'Sent to us',
              value: application.submittedAt ? formatDate(application.submittedAt) : 'Not yet sent',
            },
            {
              id: 'decided',
              label: 'Decision',
              value: application.decidedAt ? formatDate(application.decidedAt) : 'Still with us',
            },
          ]}
        />
      </Section>

      <DeclineReasons reasons={application.declineReasons} />
      <OfferPanel application={application} />
    </div>
  );
}

/**
 * @example <ApplicationDetail applicationId={applicationId} />
 */
export function ApplicationDetail({ applicationId }: ApplicationDetailProps) {
  const application = useQuery({
    queryKey: movementKeys.borrow.application(applicationId),
    queryFn: async () => (await browserApi().borrow.getApplication(applicationId)).data,
  });

  return (
    <QueryPanel query={application} skeletonRows={3}>
      {(data) => <DetailBody application={data} />}
    </QueryPanel>
  );
}
