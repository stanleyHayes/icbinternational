'use client';

/**
 * Everything the send-money screen needs, wired together.
 *
 * The flow's state, the quote's lifecycle and the send mutation are three separate concerns and
 * are written as three separate hooks. This is the one place that knows how they connect, which
 * keeps the screen itself down to markup and keeps the rule that matters — no send against a dead
 * quote — in one readable function rather than spread across a component tree.
 */

import { useState } from 'react';

import type { Account, Beneficiary, Transfer } from '@reliance/contracts';

import {
  describeDestination,
  type DestinationDraft,
  type DestinationErrors,
  destinationErrors,
  draftFromPayee,
  toDestination,
} from '@/components/transfers';

import type { AmountDraft } from './amount-step';
import { isStepUpCancellation, useSendTransfer } from './use-send-transfer';
import { FlowStep, useTransferFlow, type TransferFlow } from './use-transfer-flow';
import { useTransferQuote, type TransferQuoteState } from './use-transfer-quote';

/** What {@link useFlowController} hands the screen. */
export interface FlowController {
  readonly step: FlowStep;
  readonly flow: TransferFlow;
  readonly accounts: readonly Account[];
  readonly quoting: TransferQuoteState;
  /** Field messages, empty until the customer has tried to move on. */
  readonly errors: DestinationErrors;
  readonly payeeName: string;
  readonly sending: boolean;
  readonly authorising: boolean;
  /** The refusal worth showing, with a cancelled step-up filtered out. */
  readonly failure: unknown;
  readonly sent: Transfer | undefined;
  readonly leaveDestination: () => void;
  readonly send: () => void;
  readonly repeat: () => void;
}

/** The create-transfer body, with the optional fields present only when they are set. */
function sendInput(quoteId: string, requiresStepUp: boolean, amount: AmountDraft) {
  return {
    quoteId,
    requiresStepUp,
    saveBeneficiary: amount.saveBeneficiary,
    ...(amount.reference ? { reference: amount.reference } : {}),
    ...(amount.saveBeneficiary && amount.beneficiaryNickname
      ? { beneficiaryNickname: amount.beneficiaryNickname }
      : {}),
  };
}

/** Who the review screen names, falling back while the destination is still incomplete. */
function payeeNameOf(draft: DestinationDraft): string {
  const destination = toDestination(draft);
  return destination ? describeDestination(destination) : 'this payee';
}

/**
 * @param accounts the accounts a payment may be funded from.
 * @param initialPayee a saved payee to start from, when the customer came from "pay again".
 */
export function useFlowController(
  accounts: readonly Account[] | undefined,
  initialPayee: Beneficiary | undefined,
): FlowController {
  const seed = initialPayee ? draftFromPayee(initialPayee.destination, initialPayee.id) : undefined;
  const flow = useTransferFlow(accounts, seed);
  const quoting = useTransferQuote(flow.quoteRequest);
  const { send, resetIntention, authorising } = useSendTransfer();
  const [showErrors, setShowErrors] = useState(false);

  const errors = destinationErrors(flow.destination);

  return {
    step: send.data ? FlowStep.DONE : flow.step,
    flow,
    accounts: accounts ?? [],
    quoting,
    errors: showErrors ? errors : {},
    payeeName: payeeNameOf(flow.destination),
    sending: send.isPending,
    authorising,
    failure: isStepUpCancellation(send.error) ? null : send.error,
    sent: send.data,

    leaveDestination: () => {
      const invalid = Object.keys(errors).length > 0;
      setShowErrors(invalid);
      if (!invalid) flow.goTo(FlowStep.AMOUNT);
    },

    send: () => {
      if (!quoting.quote || !quoting.usable) return;
      send.mutate(sendInput(quoting.quote.id, quoting.quote.requiresStepUp, flow.amount));
    },

    repeat: () => {
      resetIntention();
      flow.repeat();
    },
  };
}
