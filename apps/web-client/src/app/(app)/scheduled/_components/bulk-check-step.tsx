'use client';

/**
 * The step where nothing has happened yet and everything is visible.
 *
 * Totals first, so a customer can compare against whatever produced the file, then every row with
 * its own verdict. The send button counts the payments it will actually make, because "Send" on a
 * file with eleven bad rows out of two hundred is a button that does something different from what
 * it says.
 */

import type { CurrencyCode } from '@reliance/money';
import { Button } from '@reliance/ui';

import { FormAlert } from '@/components/shell';
import { Section } from '@/components/transfers';

import { BulkPreview } from './bulk-preview';
import { BulkTotals } from './bulk-totals';
import type { BulkUpload } from './use-bulk-upload';

/** Props for {@link BulkCheckStep}. */
export interface BulkCheckStepProps {
  readonly upload: BulkUpload;
  readonly currency: CurrencyCode;
}

/**
 * @example <BulkCheckStep upload={upload} currency="GBP" />
 */
export function BulkCheckStep({ upload, currency }: BulkCheckStepProps) {
  if (!upload.parsed) return null;

  return (
    <Section
      title="Check every row"
      description="Nothing has been sent. Fix anything marked below and upload the file again."
    >
      <BulkTotals rows={upload.parsed.rows} currency={currency} />

      <div className="mt-4">
        <BulkPreview rows={upload.parsed.rows} currency={currency} />
      </div>

      <FormAlert error={upload.submit.error} />

      <div className="border-border mt-5 flex flex-wrap justify-end gap-3 border-t pt-4">
        <Button variant="secondary" onClick={upload.clear}>
          Start again with a different file
        </Button>
        <Button
          disabled={!upload.canSubmit}
          loading={upload.submit.isPending}
          onClick={() => upload.submit.mutate(currency)}
        >
          Send {upload.validCount} payments
        </Button>
      </div>
    </Section>
  );
}
