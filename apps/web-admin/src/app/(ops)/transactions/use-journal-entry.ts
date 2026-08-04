/**
 * Reading one journal entry, and raising the entry that reverses it.
 *
 * A reversal is not an edit and there is no endpoint that performs one directly. It is a
 * new, opposing entry — and because it moves value, it goes through dual control like any
 * other manual posting. What this builds is therefore a request for a second operator to
 * approve, and the console says so rather than implying the money has already moved back.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  PostingDirection,
  type JournalEntry,
  type ManualPostingRequest,
  type Transaction,
} from '@reliance/contracts';

import { contraLedgerCode, customerLeg } from '@/components/finance';
import { opsKeys } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';

/** Longest a narrative may be on the wire. Beyond it the platform refuses the posting. */
const NARRATIVE_LIMIT = 120;

/** Used when an entry names no general-ledger contra account of its own. */
const SUSPENSE_LEDGER_CODE = '2900';

/** One journal entry, with every posting on it. */
export function useJournalEntry(entryId: string | null) {
  const client = useApiClient();

  return useQuery({
    queryKey: opsKeys.journalEntry(entryId ?? ''),
    queryFn: async ({ signal }) =>
      (await client.admin.journalEntry(entryId ?? '', { signal })).data,
    enabled: entryId !== null,
  });
}

/**
 * The posting that would reverse this entry's customer leg.
 *
 * Every direction is flipped and the amount is left alone, which is what makes the
 * reversal balance by the same construction the original did.
 */
export function reversalFor(options: {
  readonly entry: JournalEntry;
  readonly posting: Transaction;
  readonly justification: string;
}): ManualPostingRequest {
  const { entry, posting, justification } = options;
  const leg = customerLeg(entry.postings);
  const original = leg?.direction ?? PostingDirection.DEBIT;

  return {
    accountId: leg?.accountId ?? posting.accountId,
    direction:
      original === PostingDirection.DEBIT ? PostingDirection.CREDIT : PostingDirection.DEBIT,
    amount: leg?.amount ?? posting.amount,
    contraLedgerCode: contraLedgerCode(entry.postings) ?? SUSPENSE_LEDGER_CODE,
    narrative: `Reversal of ${entry.reference}`.slice(0, NARRATIVE_LIMIT),
    justification,
  };
}

/** Raises a reversal for a second operator to approve. */
export function useRaiseReversal() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: ManualPostingRequest) =>
      (await client.admin.manualPosting(request)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: opsKeys.all('approvals') });
    },
  });
}
