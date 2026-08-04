'use client';

/**
 * The state of a payment being written.
 *
 * Four steps and two drafts. Everything derived — the quote request, whether the payment crosses a
 * currency, which of the customer's accounts are eligible as a destination — is computed here
 * rather than stored, because a copy of a derived value is a copy that goes stale the moment the
 * customer edits the thing it came from.
 *
 * Going back from the review step is deliberately free: nothing has been sent, the quote is
 * discarded by its own key changing, and the idempotency key is only reset when the customer
 * starts a genuinely new payment.
 */

import { useCallback, useMemo, useState } from 'react';

import type { Account, TransferQuoteRequest } from '@reliance/contracts';

import {
  type DestinationDraft,
  EMPTY_DRAFT,
  resolveAccount,
  toDestination,
  TransferKind,
} from '@/components/transfers';

import type { AmountDraft } from './amount-step';

/** Where the customer is in the flow. */
export const FlowStep = {
  DESTINATION: 'DESTINATION',
  AMOUNT: 'AMOUNT',
  REVIEW: 'REVIEW',
  DONE: 'DONE',
} as const;
export type FlowStep = (typeof FlowStep)[keyof typeof FlowStep];

const EMPTY_AMOUNT: AmountDraft = {
  sourceAccountId: '',
  amount: '',
  amountIsReceiveSide: false,
  reference: '',
  saveBeneficiary: false,
  beneficiaryNickname: '',
};

/** What {@link useTransferFlow} hands back. */
export interface TransferFlow {
  readonly step: FlowStep;
  readonly destination: DestinationDraft;
  readonly amount: AmountDraft;
  readonly source: Account | undefined;
  /** Accounts the money could go to — the source itself is never one of them. */
  readonly otherAccounts: readonly Account[];
  /** The priced request, or `null` until the review step is reached with a complete form. */
  readonly quoteRequest: TransferQuoteRequest | null;
  readonly crossCurrency: boolean;
  /** True when the payee was typed rather than picked, so saving them is worth offering. */
  readonly offerToSave: boolean;
  readonly patchDestination: (patch: Partial<DestinationDraft>) => void;
  readonly replaceDestination: (draft: DestinationDraft) => void;
  readonly patchAmount: (patch: Partial<AmountDraft>) => void;
  readonly goTo: (step: FlowStep) => void;
  /** Keeps the payee, clears the amount, and returns to step two. */
  readonly repeat: () => void;
}

/**
 * @param accounts the accounts a payment may be funded from.
 * @param initialDestination a payee to start from, when the customer arrived from "pay again".
 */
export function useTransferFlow(
  accounts: readonly Account[] | undefined,
  initialDestination?: DestinationDraft,
): TransferFlow {
  const [step, setStep] = useState<FlowStep>(FlowStep.DESTINATION);
  const [destination, setDestination] = useState<DestinationDraft>(
    () => initialDestination ?? EMPTY_DRAFT,
  );
  const [amount, setAmount] = useState<AmountDraft>(EMPTY_AMOUNT);

  const source = resolveAccount(accounts, amount.sourceAccountId || null);
  const otherAccounts = useMemo(
    () => (accounts ?? []).filter((account) => account.id !== source?.id),
    [accounts, source?.id],
  );

  const patchDestination = useCallback((patch: Partial<DestinationDraft>) => {
    setDestination((current) => ({ ...current, ...patch }));
  }, []);

  const patchAmount = useCallback((patch: Partial<AmountDraft>) => {
    setAmount((current) => ({ ...current, ...patch }));
  }, []);

  const repeat = useCallback(() => {
    setAmount((current) => ({ ...current, amount: '', reference: '', saveBeneficiary: false }));
    setStep(FlowStep.AMOUNT);
  }, []);

  return {
    step,
    destination,
    amount,
    source,
    otherAccounts,
    quoteRequest: step === FlowStep.REVIEW ? buildQuoteRequest(destination, amount, source) : null,
    crossCurrency: isCrossCurrency(destination, source, otherAccounts),
    offerToSave: destination.payeeId === '' && destination.kind !== TransferKind.OWN,
    patchDestination,
    replaceDestination: setDestination,
    patchAmount,
    goTo: setStep,
    repeat,
  };
}

/** The priced request, or `null` while the form is still missing something. */
function buildQuoteRequest(
  destination: DestinationDraft,
  amount: AmountDraft,
  source: Account | undefined,
): TransferQuoteRequest | null {
  const contractDestination = toDestination(destination);
  if (!contractDestination || !source || !amount.amount) return null;

  return {
    sourceAccountId: source.id,
    destination: contractDestination,
    amount: { amount: amount.amount, currency: source.currency },
    amountIsReceiveSide: amount.amountIsReceiveSide,
    chargeBearer: 'SHA',
  };
}

/** True when the payment converts between currencies, so the amount side becomes a question. */
function isCrossCurrency(
  destination: DestinationDraft,
  source: Account | undefined,
  candidates: readonly Account[],
): boolean {
  if (destination.kind === TransferKind.INTERNATIONAL) return true;
  if (destination.kind !== TransferKind.OWN) return false;

  const target = candidates.find((account) => account.id === destination.toAccountId);
  return Boolean(target && source && target.currency !== source.currency);
}
