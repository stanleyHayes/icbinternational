'use client';

/**
 * Photo ID.
 *
 * One document, chosen by the customer from the three the bank accepts. Asking for "ID" and
 * leaving people to guess which of their documents counts is the most common reason a first upload
 * is rejected.
 *
 * Documents already on the case are read from the case itself rather than from local state, so
 * coming back to this step after a refresh shows what is genuinely with the bank — not what this
 * browser remembers sending.
 */

import { useState } from 'react';

import { DocumentKind, type CustomerDocument, type KycCase } from '@reliance/contracts';
import { FormField, Select, type SelectOption } from '@reliance/ui';

import { FormAlert } from '@/components/shell';

import { CaptureGuidance } from './capture-guidance';
import { DocumentCapture } from './document-capture';
import { StepActions } from './step-actions';
import { useCompleteDocuments } from './use-kyc-case';
import { useStepNavigation } from './use-step-navigation';

const ID_KINDS: readonly SelectOption[] = [
  { value: DocumentKind.PASSPORT, label: 'Passport' },
  { value: DocumentKind.DRIVING_LICENCE, label: 'Photocard driving licence' },
  { value: DocumentKind.NATIONAL_ID, label: 'National identity card' },
];

const IDENTITY_KINDS: readonly DocumentKind[] = [
  DocumentKind.PASSPORT,
  DocumentKind.DRIVING_LICENCE,
  DocumentKind.NATIONAL_ID,
];

const GUIDANCE: readonly string[] = [
  'Lay it flat on a dark surface so all four corners are in the frame.',
  'Avoid glare — turn away from a window or an overhead light.',
  'Make sure the small print at the bottom is readable.',
];

function identityDocument(kycCase: KycCase): CustomerDocument | undefined {
  return kycCase.documents.find((document) => IDENTITY_KINDS.includes(document.kind));
}

/** Props for {@link DocumentsStep}. */
export interface DocumentsStepProps {
  readonly kycCase: KycCase;
}

interface FieldsProps {
  readonly kind: DocumentKind;
  readonly onKindChange: (kind: DocumentKind) => void;
  readonly uploaded: CustomerDocument | undefined;
  readonly onUploaded: (document: CustomerDocument) => void;
  readonly onRemove: () => void;
}

function Fields({ kind, onKindChange, uploaded, onUploaded, onRemove }: FieldsProps) {
  return (
    <>
      <FormField label="Which document are you using?" required>
        <Select
          options={ID_KINDS}
          value={kind}
          onChange={(event) => onKindChange(event.target.value as DocumentKind)}
          disabled={Boolean(uploaded)}
        />
      </FormField>

      <DocumentCapture
        kind={kind}
        label="A photo of the page with your picture on it"
        camera="environment"
        existing={uploaded}
        onUploaded={onUploaded}
        onRemove={onRemove}
      />

      <CaptureGuidance points={GUIDANCE} />
    </>
  );
}

/** Choosing and uploading a photo ID. */
export function DocumentsStep({ kycCase }: DocumentsStepProps) {
  const complete = useCompleteDocuments();
  const navigation = useStepNavigation();

  const attached = identityDocument(kycCase);
  const [kind, setKind] = useState<DocumentKind>(attached?.kind ?? DocumentKind.PASSPORT);
  const [uploaded, setUploaded] = useState<CustomerDocument | undefined>(attached);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!uploaded) return;
    navigation.advance(await complete.mutateAsync());
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <div className="flex flex-col gap-5">
        <FormAlert error={complete.error} />
        <Fields
          kind={kind}
          onKindChange={setKind}
          uploaded={uploaded}
          onUploaded={setUploaded}
          onRemove={() => setUploaded(undefined)}
        />
      </div>

      <StepActions
        submitLabel="Continue"
        busy={complete.isPending}
        disabled={!uploaded}
        onBack={() => navigation.back('DOCUMENTS')}
      />
    </form>
  );
}
