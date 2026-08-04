'use client';

/**
 * Paying many people from one file.
 *
 * Four steps, in this order and never fewer: choose the account, read the file, look at every row,
 * then approve. Validation happens twice on purpose — once here, so obvious mistakes are fixed
 * before the bank is troubled, and once at the API, which is the only opinion that counts.
 *
 * Nothing is posted until the customer approves the validated batch. The upload is a read.
 */

import { useState } from 'react';

import type { CurrencyCode } from '@reliance/money';
import { Alert, Stepper, type Step } from '@reliance/ui';

import { AccountSelect, Section, useUsableAccounts } from '@/components/transfers';

import { BulkCheckStep } from './bulk-check-step';
import { BulkSentNotice } from './bulk-sent-notice';
import { FilePicker } from './file-picker';
import { useBulkUpload } from './use-bulk-upload';

const STEPS: readonly Step[] = [
  { id: 'account', label: 'Account', description: 'Which account pays' },
  { id: 'file', label: 'File', description: 'Upload the payments' },
  { id: 'check', label: 'Check', description: 'Row by row' },
  { id: 'approve', label: 'Approve', description: 'Send the batch' },
];

const FILE_SHAPE =
  'A comma-separated file whose first row names the columns: name, sort code, account number, amount, reference.';

/**
 * @example <BulkWizard />
 */
export function BulkWizard() {
  const accounts = useUsableAccounts();
  const [sourceAccountId, setSourceAccountId] = useState('');
  const upload = useBulkUpload(sourceAccountId);

  const source = accounts.data?.find((account) => account.id === sourceAccountId);
  const currency: CurrencyCode = source?.currency ?? 'GBP';

  return (
    <div className="flex flex-col gap-6">
      <Stepper
        label="Paying many people from one file"
        steps={STEPS}
        currentIndex={upload.stepIndex}
      />

      <Section
        title="Which account pays?"
        description="Every payment in the file comes out of this account."
      >
        <AccountSelect
          label="Pay from"
          accounts={accounts.data ?? []}
          value={sourceAccountId}
          onChange={setSourceAccountId}
          disabled={upload.parsed !== null}
        />
      </Section>

      {sourceAccountId ? (
        <Section title="Upload the payments" description={FILE_SHAPE}>
          <FilePicker onFile={upload.read} fileName={upload.fileName} />
          {upload.fileProblem ? (
            <Alert tone="danger" className="mt-4" title="We could not read that file">
              {upload.fileProblem}
            </Alert>
          ) : null}
        </Section>
      ) : null}

      {upload.parsed ? <BulkCheckStep upload={upload} currency={currency} /> : null}
      {upload.batch ? <BulkSentNotice batch={upload.batch} /> : null}
    </div>
  );
}
