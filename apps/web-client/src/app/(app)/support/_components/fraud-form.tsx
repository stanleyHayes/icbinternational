'use client';

/**
 * Reporting fraud.
 *
 * Freezing cards is on by default, because under uncertainty the safe answer is to stop the
 * bleeding and unfreeze later. The screen says what will be frozen before it happens, and gives
 * the phone number first — somebody whose money is leaving right now should be talking to a person.
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import type { CreateFraudReportRequest } from '@reliance/contracts';
import { Alert, Button, FormField, Select, Switch, Textarea } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { FRAUD_KINDS } from './support-look';

const DESCRIPTION_MAX = 5000;

const FREEZE_DETAIL =
  'Nothing can be spent on any of your cards until you unfreeze them. Direct debits and standing orders carry on.';
type FraudKind = CreateFraudReportRequest['kind'];

/**
 * @example <FraudForm />
 */
export function FraudForm() {
  const [kind, setKind] = useState<FraudKind>('CARD_FRAUD');
  const [description, setDescription] = useState('');
  const [freezeCards, setFreezeCards] = useState(true);

  const report = useMutation({
    mutationFn: async (body: CreateFraudReportRequest) =>
      (await browserApi().support.reportFraud(body)).data,
  });

  const submit = (): void => {
    if (!description.trim()) return;
    report.mutate({
      kind,
      description: description.trim(),
      transactionIds: [],
      freezeCards,
      freezeAccounts: false,
    });
  };

  return (
    <Section title="Report fraud" description="We act on this within minutes, not hours.">
      <div className="flex flex-col gap-5">
        <CallUsFirst />
        <FormAlert error={report.error} />
        {report.data ? <Reported reference={report.data.reference} /> : null}

        <FraudFields
          kind={kind}
          description={description}
          freezeCards={freezeCards}
          onKind={setKind}
          onDescription={setDescription}
          onFreezeCards={setFreezeCards}
        />

        <ReportRow disabled={!description.trim()} pending={report.isPending} onSubmit={submit} />
      </div>
    </Section>
  );
}

/** The number to ring, above everything else on the screen. */
function CallUsFirst() {
  return (
    <Alert tone="danger" title="If money is leaving your account right now, call us">
      Ring 0800 460 0460. We answer around the clock and can stop payments while you are on the
      line. Fill this in afterwards, or instead if you would rather not call.
    </Alert>
  );
}

/** The acknowledgement, with the reference the fraud team will quote. */
function Reported({ reference }: { readonly reference: string }) {
  return (
    <div role="status" aria-live="polite">
      <Alert tone="success" title="Your report is with our fraud team">
        <p>
          Your reference is <span className="font-mono select-all">{reference}</span>. Keep it — we
          will use it whenever we contact you about this.
        </p>
        <p className="mt-2">
          Anything you asked us to freeze is frozen already. We will be in touch within a few hours,
          and sooner if we find anything.
        </p>
      </Alert>
    </div>
  );
}

/** Props for {@link FraudFields}. */
interface FraudFieldsProps {
  readonly kind: FraudKind;
  readonly description: string;
  readonly freezeCards: boolean;
  readonly onKind: (value: FraudKind) => void;
  readonly onDescription: (value: string) => void;
  readonly onFreezeCards: (value: boolean) => void;
}

/** What happened, and whether to stop the cards while we look. */
function FraudFields(props: FraudFieldsProps) {
  return (
    <>
      <FormField label="What has happened?" required>
        <Select
          options={FRAUD_KINDS}
          value={props.kind}
          onChange={(event) => props.onKind(event.target.value as FraudKind)}
        />
      </FormField>

      <Textarea
        value={props.description}
        maxLength={DESCRIPTION_MAX}
        showCount
        rows={7}
        aria-label="What happened"
        placeholder="What happened, when, and anything you noticed. Do not worry about getting it perfectly right."
        onChange={(event) => props.onDescription(event.target.value)}
      />

      <Switch
        checked={props.freezeCards}
        description={FREEZE_DETAIL}
        onChange={(event) => props.onFreezeCards(event.target.checked)}
      >
        {props.freezeCards ? 'Freeze my cards now' : 'Leave my cards working'}
      </Switch>
    </>
  );
}

/** The one action on the form, styled as the serious thing it is. */
function ReportRow({
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
      <Button variant="danger" disabled={disabled} loading={pending} onClick={onSubmit}>
        Report this now
      </Button>
    </div>
  );
}
