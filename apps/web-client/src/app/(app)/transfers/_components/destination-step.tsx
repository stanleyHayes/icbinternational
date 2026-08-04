'use client';

/**
 * Step one: who is being paid.
 *
 * Saved payees first, then the fields for whichever rail the customer chose. Confirmation of payee
 * runs when the identifying fields lose focus rather than on every keystroke, because the
 * receiving bank is a real service and a check per character is an abuse of it.
 */

import type { Account } from '@reliance/contracts';
import { Alert, Button } from '@reliance/ui';

import {
  type DestinationDraft,
  DomesticFields,
  draftFromPayee,
  InternationalFields,
  KindPicker,
  NameCheckNotice,
  OwnAccountFields,
  RelianceFields,
  Section,
  toDestination,
  TransferKind,
  useNameCheck,
} from '@/components/transfers';

import { PayeePicker } from './payee-picker';

const CHECKED_KINDS: ReadonlySet<TransferKind> = new Set([
  TransferKind.DOMESTIC,
  TransferKind.INTERNATIONAL,
]);

/** Props for {@link DestinationStep}. */
export interface DestinationStepProps {
  readonly draft: DestinationDraft;
  readonly onChange: (patch: Partial<DestinationDraft>) => void;
  readonly onReplace: (draft: DestinationDraft) => void;
  /** The customer's other accounts, with the chosen source already removed. */
  readonly otherAccounts: readonly Account[];
  readonly errors: Readonly<Record<string, string>>;
  readonly onContinue: () => void;
}

/** The fields for the chosen rail. */
function Fields(props: DestinationStepProps & { readonly onDetailsBlur: () => void }) {
  const { draft, onChange, errors, otherAccounts, onDetailsBlur } = props;

  if (draft.kind === TransferKind.OWN) {
    return <OwnAccountFields draft={draft} onChange={onChange} accounts={otherAccounts} />;
  }
  if (draft.kind === TransferKind.RELIANCE) {
    return <RelianceFields draft={draft} onChange={onChange} errors={errors} />;
  }
  if (draft.kind === TransferKind.DOMESTIC) {
    return (
      <DomesticFields
        draft={draft}
        onChange={onChange}
        errors={errors}
        onDetailsBlur={onDetailsBlur}
      />
    );
  }
  return (
    <InternationalFields
      draft={draft}
      onChange={onChange}
      errors={errors}
      onDetailsBlur={onDetailsBlur}
    />
  );
}

/** The extra warning an international payment earns. */
function CorrespondentNotice() {
  return (
    <Alert tone="info" title="Before you send abroad">
      The receiving bank, and any bank in between, may take a charge from the amount that arrives.
      We show you our fee and the exchange rate on the next screen.
    </Alert>
  );
}

/**
 * @example <DestinationStep draft={draft} onChange={patch} onContinue={next} … />
 */
export function DestinationStep(props: DestinationStepProps) {
  const { draft, onReplace, onContinue } = props;
  const nameCheck = useNameCheck();
  const destination = toDestination(draft);

  const runNameCheck = (): void => {
    if (!destination || !CHECKED_KINDS.has(draft.kind) || !draft.accountName) return;
    nameCheck.mutate({ destination, expectedName: draft.accountName });
  };

  return (
    <div className="flex flex-col gap-6">
      {draft.kind === TransferKind.OWN ? null : (
        <Section title="Someone you have paid before" description="Pick a payee to fill this in.">
          <PayeePicker
            selectedId={draft.payeeId}
            onPick={(payee) => onReplace(draftFromPayee(payee.destination, payee.id))}
          />
        </Section>
      )}

      <Section title="Where the money is going">
        <div className="flex flex-col gap-6">
          <KindPicker value={draft.kind} onChange={(kind) => onReplace({ ...draft, kind })} />

          <Fields {...props} onDetailsBlur={runNameCheck} />

          {nameCheck.isPending ? (
            <p role="status" className="text-fg-muted text-sm">
              Checking the name with the receiving bank…
            </p>
          ) : null}

          <NameCheckNotice result={nameCheck.data} enteredName={draft.accountName} />

          {draft.kind === TransferKind.INTERNATIONAL ? <CorrespondentNotice /> : null}

          <div className="flex justify-end">
            <Button onClick={onContinue}>Continue to the amount</Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
