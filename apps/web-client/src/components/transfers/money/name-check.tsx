'use client';

/**
 * Confirmation of payee, shown plainly.
 *
 * This is the single most effective control there is against a customer being talked into paying a
 * fraudster, and it only works if the result is *readable*. A green tick and the word "verified"
 * is not a result. "The account belongs to J Smith, not John Smith" is, and it is the sentence
 * that makes somebody stop.
 *
 * A close match or a mismatch is never rendered as a blocking error: the customer may well be
 * right and the receiving bank's records stale. It is a warning they have to read past, with the
 * name the other bank holds spelled out beside their own spelling.
 *
 * The announcement comes from a region that is mounted empty from the first render and filled when
 * the answer lands. A live region inserted into the DOM already holding its text announces nothing
 * — which on this control would mean the one result that stops a fraud never reaches the customer
 * who cannot see it.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import type { NameCheck } from '@reliance/api-client';
import { NameCheckResult, type TransferDestination } from '@reliance/contracts';
import { Alert, type Tone } from '@reliance/ui';

import { browserApi } from '@/lib/api';

/** How each outcome is headlined and toned. */
const LOOK: Readonly<Record<NameCheckResult, { title: string; tone: Tone }>> = {
  [NameCheckResult.MATCH]: { title: 'The name matches the account', tone: 'success' },
  [NameCheckResult.CLOSE_MATCH]: { title: 'The name is close, but not exact', tone: 'warning' },
  [NameCheckResult.NO_MATCH]: { title: 'The name does not match this account', tone: 'danger' },
  [NameCheckResult.UNAVAILABLE]: { title: 'We could not check this name', tone: 'info' },
};

/** What each outcome means for the customer, and what to do about it. */
const ADVICE: Readonly<Record<NameCheckResult, string>> = {
  [NameCheckResult.MATCH]:
    'The receiving bank confirms the account is held in that name. It is safe to continue.',
  [NameCheckResult.CLOSE_MATCH]:
    'Check the spelling with the person you are paying before you send anything. If you were asked to change these details by email or message, stop and call us on 0800 460 0460.',
  [NameCheckResult.NO_MATCH]:
    'Do not send this payment until you have spoken to the person you are paying, on a number you already had. Money sent to the wrong account is very hard to get back.',
  [NameCheckResult.UNAVAILABLE]:
    'The receiving bank did not answer. You can still send the payment, but we cannot confirm whose account it is.',
};

/** What a confirmation-of-payee check needs. */
export interface NameCheckInput {
  readonly destination: TransferDestination;
  readonly expectedName: string;
}

/** Runs a confirmation-of-payee check against the receiving bank. */
export function useNameCheck(): UseMutationResult<NameCheck, unknown, NameCheckInput> {
  return useMutation({
    mutationFn: async (input: NameCheckInput) =>
      (await browserApi().beneficiaries.verifyName(input)).data,
  });
}

/** Props for {@link NameCheckNotice}. */
export interface NameCheckNoticeProps {
  readonly result: NameCheck | undefined;
  /** The name the customer typed, quoted back beside the bank's. */
  readonly enteredName: string;
}

/** The whole outcome as prose, for the live region. Empty while there is nothing to say. */
function announcement(result: NameCheck | undefined, enteredName: string): string {
  if (!result) return '';

  const sentences = [`${LOOK[result.result].title}.`, ADVICE[result.result]];
  if (result.suggestion) {
    sentences.push(`You entered ${enteredName}. The receiving bank holds ${result.suggestion}.`);
  }

  return sentences.join(' ');
}

/** The visible result. Not itself a live region — see the module note. */
function Outcome({
  result,
  enteredName,
}: {
  readonly result: NameCheck;
  readonly enteredName: string;
}) {
  const look = LOOK[result.result];

  return (
    <Alert tone={look.tone} title={look.title}>
      <p>{ADVICE[result.result]}</p>
      {result.suggestion ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-fg-muted">You entered</dt>
          <dd className="font-medium">{enteredName}</dd>
          <dt className="text-fg-muted">The bank holds</dt>
          <dd className="font-medium">{result.suggestion}</dd>
        </dl>
      ) : null}
    </Alert>
  );
}

/**
 * @example <NameCheckNotice result={check.data} enteredName={form.accountName} />
 */
export function NameCheckNotice({ result, enteredName }: NameCheckNoticeProps) {
  return (
    <>
      {/* `sr-only` is absolutely positioned, so the empty region adds no gap to the form column. */}
      <p aria-live="polite" className="sr-only">
        {announcement(result, enteredName)}
      </p>
      {result ? <Outcome result={result} enteredName={enteredName} /> : null}
    </>
  );
}

/** True when the outcome should make the customer pause before the money moves. */
export function needsAcknowledgement(result: NameCheck | undefined): boolean {
  return (
    result?.result === NameCheckResult.CLOSE_MATCH || result?.result === NameCheckResult.NO_MATCH
  );
}
