'use client';

/**
 * Sending the money.
 *
 * Three things this has to get right, all of them the kind of bug that costs a customer real
 * money rather than a bad afternoon.
 *
 * **One key per intention.** The idempotency key is minted when the customer reaches the review
 * screen and reused for every attempt against that same quote. A key minted per attempt protects
 * against nothing: a request that times out after the API accepted it, retried with a fresh key,
 * sends the payment twice.
 *
 * **Step-up on the one call.** When the quote says the bank will demand re-authentication, the
 * grant is fetched and attached to this request alone, never held.
 *
 * **The cache is wrong the moment this succeeds.** Balances, transactions and the transfer list
 * are all invalidated, because a dashboard still showing the pre-payment balance is a dashboard
 * that will be trusted.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { newIdempotencyKey } from '@reliance/api-client';
import type { CreateTransferRequest, Transfer } from '@reliance/contracts';

import { StepUpCancelled, useStepUp } from '@/components/shell';
import { movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const STEP_UP_REASON = 'authorise this payment';

/** What the send mutation is given. */
export interface SendTransferInput extends CreateTransferRequest {
  /** From the quote. When true the customer re-authenticates before anything is sent. */
  readonly requiresStepUp: boolean;
}

/** What {@link useSendTransfer} hands back. */
export interface SendTransferState {
  readonly send: UseMutationResult<Transfer, unknown, SendTransferInput>;
  /** Starts a fresh intention, and therefore a fresh idempotency key. */
  readonly resetIntention: () => void;
  /** True while the customer is being asked to prove it is them. */
  readonly authorising: boolean;
}

/** Sends a quoted transfer, once. */
export function useSendTransfer(): SendTransferState {
  const stepUp = useStepUp();
  const cache = useQueryClient();
  const [authorising, setAuthorising] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const send = useMutation<Transfer, unknown, SendTransferInput>({
    mutationFn: async ({ requiresStepUp, ...body }) => {
      let token: string | undefined;
      if (requiresStepUp) {
        setAuthorising(true);
        try {
          token = await stepUp.authorise(STEP_UP_REASON);
        } finally {
          setAuthorising(false);
        }
      }

      const options = {
        idempotencyKey: idempotencyKey.current,
        ...(token ? { stepUpToken: token } : {}),
      };
      return (await browserApi().transfers.create(body, options)).data;
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: queryKeys.accounts.all }),
        cache.invalidateQueries({ queryKey: queryKeys.transactions.all }),
        cache.invalidateQueries({ queryKey: movementKeys.transfers.all }),
        cache.invalidateQueries({ queryKey: movementKeys.beneficiaries.all }),
      ]);
    },
  });

  const resetIntention = useCallback(() => {
    idempotencyKey.current = newIdempotencyKey();
    send.reset();
  }, [send]);

  return { send, resetIntention, authorising };
}

/** True when the failure was the customer declining to re-authenticate, not a refusal. */
export function isStepUpCancellation(error: unknown): boolean {
  return error instanceof StepUpCancelled;
}
