'use client';

/**
 * Step two: how much, from where, and what to call it.
 *
 * The reference is a first-class field rather than an afterthought, because it is the only thing
 * the person on the other end sees. On a cross-currency payment the customer chooses which side is
 * fixed: spend exactly this, or have exactly that arrive. Both are common, and guessing wrong
 * costs somebody a few pounds.
 */

import type { Account } from '@reliance/contracts';
import { Button, FormField, Input } from '@reliance/ui';

import { AccountSelect, AmountField, Section } from '@/components/transfers';

import { AmountSidePicker } from './amount-side-picker';
import { SavePayeePanel } from './save-payee-panel';

const REFERENCE_MAX = 140;
const REFERENCE_HINT = 'This is what the person receiving the money will see on their statement.';

/** Everything the amount step edits. */
export interface AmountDraft {
  readonly sourceAccountId: string;
  /** Integer minor units. */
  readonly amount: string;
  readonly amountIsReceiveSide: boolean;
  readonly reference: string;
  readonly saveBeneficiary: boolean;
  readonly beneficiaryNickname: string;
}

/** Props for {@link AmountStep}. */
export interface AmountStepProps {
  readonly value: AmountDraft;
  readonly onChange: (patch: Partial<AmountDraft>) => void;
  readonly accounts: readonly Account[];
  readonly source: Account | undefined;
  /** True when the payee was typed rather than picked, so saving them is worth offering. */
  readonly offerToSave: boolean;
  /** True when the payment converts between currencies. */
  readonly crossCurrency: boolean;
  readonly onBack: () => void;
  readonly onContinue: () => void;
}

/**
 * @example <AmountStep value={amount} onChange={patch} accounts={accounts} … />
 */
export function AmountStep(props: AmountStepProps) {
  const { value, onChange, accounts, source, onBack, onContinue } = props;
  const ready = value.amount !== '' && value.amount !== '0' && value.sourceAccountId !== '';

  return (
    <Section title="How much are you sending?">
      <div className="flex flex-col gap-6">
        <AccountSelect
          label="Pay from"
          accounts={accounts}
          value={value.sourceAccountId}
          onChange={(sourceAccountId) => onChange({ sourceAccountId })}
        />

        <AmountField
          label="Amount"
          currency={source?.currency ?? 'GBP'}
          value={value.amount}
          onChange={(amount) => onChange({ amount })}
          available={source?.balance.available.amount}
        />

        {props.crossCurrency ? (
          <AmountSidePicker
            receiveSide={value.amountIsReceiveSide}
            onChange={(amountIsReceiveSide) => onChange({ amountIsReceiveSide })}
          />
        ) : null}

        <FormField label="Reference" hint={REFERENCE_HINT}>
          <Input
            value={value.reference}
            maxLength={REFERENCE_MAX}
            onChange={(event) => onChange({ reference: event.target.value })}
          />
        </FormField>

        {props.offerToSave ? <SavePayeePanel value={value} onChange={onChange} /> : null}

        <StepActions ready={ready} onBack={onBack} onContinue={onContinue} />
      </div>
    </Section>
  );
}

/** Back and forward, with forward disabled until there is an amount to review. */
function StepActions({
  ready,
  onBack,
  onContinue,
}: Pick<AmountStepProps, 'onBack' | 'onContinue'> & { readonly ready: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-3">
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
      <Button onClick={onContinue} disabled={!ready}>
        Review this payment
      </Button>
    </div>
  );
}
