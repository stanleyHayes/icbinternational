'use client';

/**
 * Work and income.
 *
 * Occupation and employer only appear once the customer says they are working — asking a retired
 * customer for their employer is how a form tells somebody it was not written for them.
 *
 * Income is collected through `CurrencyInput`, whose state is a string of integer minor units from
 * the first keystroke. No float exists anywhere on this path, which is the point: an annual income
 * is an input to the limits engine, and the limits engine is arithmetic on money.
 */

import { useState } from 'react';

import { EmploymentStatus } from '@reliance/contracts';
import { CurrencyInput, FormField, Input, Select, type SelectOption } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { readDraft, saveDraft } from '@/lib/kyc-draft';

import { StepActions } from './step-actions';
import { useSubmitStep, type StepSubmission } from './use-kyc-case';
import { useStepNavigation } from './use-step-navigation';

const INCOME_CURRENCY = 'GBP';

const STATUS_OPTIONS: readonly SelectOption[] = [
  { value: EmploymentStatus.EMPLOYED, label: 'Employed' },
  { value: EmploymentStatus.SELF_EMPLOYED, label: 'Self-employed' },
  { value: EmploymentStatus.STUDENT, label: 'Student' },
  { value: EmploymentStatus.RETIRED, label: 'Retired' },
  { value: EmploymentStatus.UNEMPLOYED, label: 'Not working at the moment' },
  { value: EmploymentStatus.OTHER, label: 'Something else' },
];

const WORKING: readonly EmploymentStatus[] = [
  EmploymentStatus.EMPLOYED,
  EmploymentStatus.SELF_EMPLOYED,
];

interface FieldsProps {
  readonly status: EmploymentStatus;
  readonly onStatusChange: (status: EmploymentStatus) => void;
  readonly occupation: string;
  readonly onOccupationChange: (value: string) => void;
  readonly employerName: string;
  readonly onEmployerChange: (value: string) => void;
}

function WorkFields(props: FieldsProps) {
  const { status, onStatusChange, occupation, onOccupationChange, employerName, onEmployerChange } =
    props;

  return (
    <>
      <FormField label="What best describes your situation?" required>
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(event) => onStatusChange(event.target.value as EmploymentStatus)}
        />
      </FormField>

      {WORKING.includes(status) ? (
        <>
          <FormField label="Job title" hint="For example, Registered Nurse or Site Manager.">
            <Input
              autoComplete="organization-title"
              value={occupation}
              onChange={(event) => onOccupationChange(event.target.value)}
            />
          </FormField>

          <FormField label="Employer or business name">
            <Input
              autoComplete="organization"
              value={employerName}
              onChange={(event) => onEmployerChange(event.target.value)}
            />
          </FormField>
        </>
      ) : null}
    </>
  );
}

function IncomeField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (income: string) => void;
}) {
  return (
    <FormField
      label="Annual income before tax"
      hint="Everything you receive in a year — pay, pension, benefits, rent. An approximate figure is fine."
    >
      <CurrencyInput currency={INCOME_CURRENCY} value={value} onValueChange={onChange} />
    </FormField>
  );
}

interface Answers {
  readonly status: EmploymentStatus;
  readonly occupation: string;
  readonly employerName: string;
  /** Minor units, straight from `CurrencyInput`. Never a float. */
  readonly income: string;
}

function rememberAnswers(answers: Answers): void {
  saveDraft({
    employmentStatus: answers.status,
    occupation: answers.occupation,
    employerName: answers.employerName,
    annualIncomeMajor: answers.income,
    incomeCurrency: INCOME_CURRENCY,
  });
}

function answerFor({ status, occupation, employerName, income }: Answers): StepSubmission {
  const employed = WORKING.includes(status);
  return {
    step: 'EMPLOYMENT',
    body: {
      step: 'EMPLOYMENT',
      employmentStatus: status,
      ...(occupation ? { occupation } : {}),
      ...(employed && employerName ? { employerName } : {}),
      ...(income ? { annualIncome: { amount: income, currency: INCOME_CURRENCY } } : {}),
    },
  };
}

/** Employment status, occupation, employer and annual income. */
export function EmploymentStep() {
  const draft = readDraft();
  const submitStep = useSubmitStep();
  const navigation = useStepNavigation();

  const [answers, setAnswers] = useState<Answers>({
    status: draft.employmentStatus ?? EmploymentStatus.EMPLOYED,
    occupation: draft.occupation ?? '',
    employerName: draft.employerName ?? '',
    income: draft.annualIncomeMajor ?? '',
  });

  const change = (patch: Partial<Answers>): void =>
    setAnswers((previous) => ({ ...previous, ...patch }));

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    rememberAnswers(answers);
    navigation.advance(await submitStep.mutateAsync(answerFor(answers)));
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <div className="flex flex-col gap-5">
        <FormAlert error={submitStep.error} />

        <WorkFields
          status={answers.status}
          onStatusChange={(status) => change({ status })}
          occupation={answers.occupation}
          onOccupationChange={(occupation) => change({ occupation })}
          employerName={answers.employerName}
          onEmployerChange={(employerName) => change({ employerName })}
        />

        <IncomeField value={answers.income} onChange={(income) => change({ income })} />
      </div>

      <StepActions
        submitLabel="Continue"
        busy={submitStep.isPending}
        onBack={() => navigation.back('EMPLOYMENT')}
      />
    </form>
  );
}
