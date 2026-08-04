'use client';

/**
 * Where the money comes from.
 *
 * Explained rather than merely asked. This is the question customers find intrusive, and the
 * reason it exists — the bank is legally required to know, and the answer is what stops a genuine
 * inheritance being held up as suspicious — makes it answerable rather than annoying.
 *
 * A free-text detail box appears for the answers that are rarely self-explanatory, because "Other"
 * with nothing after it is an answer that guarantees a follow-up question later.
 */

import { useState } from 'react';

import { SourceOfFunds } from '@reliance/contracts';
import { FormField, Radio, RadioGroup, Textarea } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { readDraft, saveDraft } from '@/lib/kyc-draft';

import { StepActions } from './step-actions';
import { useSubmitStep, type StepSubmission } from './use-kyc-case';
import { useStepNavigation } from './use-step-navigation';

const GROUP_NAME = 'source-of-funds';

const OPTIONS: readonly {
  readonly value: SourceOfFunds;
  readonly label: string;
  readonly detail: string;
}[] = [
  { value: SourceOfFunds.SALARY, label: 'Salary or wages', detail: 'Pay from an employer' },
  {
    value: SourceOfFunds.BUSINESS_INCOME,
    label: 'Business income',
    detail: 'Profit or drawings from a business you run',
  },
  {
    value: SourceOfFunds.PENSION,
    label: 'Pension',
    detail: 'A state, workplace or private pension',
  },
  { value: SourceOfFunds.SAVINGS, label: 'Savings', detail: 'Money you have already put aside' },
  {
    value: SourceOfFunds.INVESTMENTS,
    label: 'Investments',
    detail: 'Dividends, interest or the sale of investments',
  },
  {
    value: SourceOfFunds.PROPERTY_SALE,
    label: 'Sale of a property',
    detail: 'Proceeds from selling a home or land',
  },
  {
    value: SourceOfFunds.INHERITANCE,
    label: 'Inheritance or a gift',
    detail: 'Money left to you or given to you',
  },
  { value: SourceOfFunds.OTHER, label: 'Something else', detail: 'Tell us below' },
];

/** Answers that are hard to interpret without a sentence of context. */
const NEEDS_DETAIL: readonly SourceOfFunds[] = [
  SourceOfFunds.OTHER,
  SourceOfFunds.INHERITANCE,
  SourceOfFunds.PROPERTY_SALE,
  SourceOfFunds.INVESTMENTS,
];

function SourceOptions({
  value,
  onChange,
}: {
  readonly value: SourceOfFunds;
  readonly onChange: (source: SourceOfFunds) => void;
}) {
  return (
    <RadioGroup legend="Where will most of the money in this account come from?" name={GROUP_NAME}>
      {OPTIONS.map((option) => (
        <Radio
          key={option.value}
          name={GROUP_NAME}
          value={option.value}
          description={option.detail}
          checked={value === option.value}
          onChange={() => onChange(option.value)}
        >
          {option.label}
        </Radio>
      ))}
    </RadioGroup>
  );
}

function answerFor(source: SourceOfFunds, detail: string): StepSubmission {
  const trimmed = detail.trim();
  return {
    step: 'SOURCE_OF_FUNDS',
    body: {
      step: 'SOURCE_OF_FUNDS',
      sourceOfFunds: source,
      ...(trimmed ? { detail: trimmed } : {}),
    },
  };
}

/** The main source of the money the customer will pay in. */
export function SourceOfFundsStep() {
  const draft = readDraft();
  const submitStep = useSubmitStep();
  const navigation = useStepNavigation();

  const [source, setSource] = useState<SourceOfFunds>(draft.sourceOfFunds ?? SourceOfFunds.SALARY);
  const [detail, setDetail] = useState(draft.sourceDetail ?? '');

  const detailRequired = NEEDS_DETAIL.includes(source);
  const blocked = detailRequired && detail.trim().length === 0;

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (blocked) return;
    saveDraft({ sourceOfFunds: source, sourceDetail: detail });
    navigation.advance(await submitStep.mutateAsync(answerFor(source, detail)));
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <div className="flex flex-col gap-5">
        <FormAlert error={submitStep.error} />

        <SourceOptions value={source} onChange={setSource} />

        {detailRequired ? (
          <FormField
            label="Tell us a little more"
            hint="A sentence is enough. For example: “Proceeds from selling my flat in Leeds in March.”"
            error={blocked ? 'Please add a short explanation.' : undefined}
            required
          >
            <Textarea rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} />
          </FormField>
        ) : null}
      </div>

      <StepActions
        submitLabel="Continue"
        busy={submitStep.isPending}
        disabled={blocked}
        onBack={() => navigation.back('SOURCE_OF_FUNDS')}
      />
    </form>
  );
}
