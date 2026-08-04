'use client';

/**
 * The bulk file's journey from a spreadsheet to a validated batch.
 *
 * Reading the file is local and instant, which is what makes per-row feedback possible before the
 * bank is involved at all. Submitting sends only the rows that passed, because a batch containing
 * rows the customer has already been told are wrong is a batch that will half-fail.
 *
 * The submission is idempotency-keyed by the client library, so a retry after a timeout does not
 * pay everybody twice.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { BulkTransfer } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { parsePaymentFile, type ParsedFile, type ParsedRow } from './parse-csv';

const STEP_ACCOUNT = 0;
const STEP_FILE = 1;
const STEP_CHECK = 2;
const STEP_APPROVE = 3;

/** What {@link useBulkUpload} hands the wizard. */
export interface BulkUpload {
  readonly fileName: string | null;
  readonly parsed: ParsedFile | null;
  readonly fileProblem: string | null;
  readonly validCount: number;
  readonly canSubmit: boolean;
  readonly stepIndex: number;
  readonly batch: BulkTransfer | undefined;
  readonly submit: UseMutationResult<BulkTransfer, unknown, CurrencyCode>;
  readonly read: (file: File) => void;
  readonly clear: () => void;
}

/** Submits only the rows that passed. A batch carrying known-bad rows is a batch that half-fails. */
function useSubmitBatch(
  sourceAccountId: string,
  fileName: string | null,
  valid: readonly ParsedRow[],
) {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async (currency: CurrencyCode) => {
      const rows = valid.map((row) => ({
        accountName: row.accountName,
        accountNumber: row.accountNumber,
        sortCode: row.sortCode,
        amount: { amount: row.amount, currency },
        ...(row.reference ? { reference: row.reference } : {}),
      }));

      return (
        await browserApi().bulkTransfers.create({
          sourceAccountId,
          fileName: fileName ?? 'payments.csv',
          rows,
        })
      ).data;
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: movementKeys.bulkTransfers.all });
    },
  });
}

/** @param sourceAccountId the account every payment in the file comes out of. */
export function useBulkUpload(sourceAccountId: string): BulkUpload {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);

  const valid = (parsed?.rows ?? []).filter((row) => row.problem === null);

  const submit = useSubmitBatch(sourceAccountId, fileName, valid);

  const read = (file: File): void => {
    setFileName(file.name);
    readFile(file, setParsed);
  };

  return {
    fileName,
    parsed: parsed && parsed.rows.length > 0 ? parsed : null,
    fileProblem: parsed?.fileProblem ?? null,
    validCount: valid.length,
    canSubmit: valid.length > 0 && sourceAccountId !== '' && !submit.data,
    stepIndex: stepIndexFor(sourceAccountId, parsed, Boolean(submit.data)),
    batch: submit.data,
    submit,
    read,
    clear: () => {
      setParsed(null);
      setFileName(null);
      submit.reset();
    },
  };
}

/** Reads the file's text off the main thread's critical path and parses it. */
function readFile(file: File, onParsed: (parsed: ParsedFile) => void): void {
  file
    .text()
    .then((text) => onParsed(parsePaymentFile(text)))
    .catch(() =>
      onParsed({
        rows: [],
        fileProblem:
          'We could not open that file. Try saving it again as a CSV and upload it once more.',
      }),
    );
}

/** Which step of the wizard the current state corresponds to. */
function stepIndexFor(sourceAccountId: string, parsed: ParsedFile | null, sent: boolean): number {
  if (sent) return STEP_APPROVE;
  if (parsed && parsed.rows.length > 0) return STEP_CHECK;
  return sourceAccountId ? STEP_FILE : STEP_ACCOUNT;
}
