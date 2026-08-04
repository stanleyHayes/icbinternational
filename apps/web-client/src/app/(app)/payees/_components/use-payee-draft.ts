'use client';

/**
 * The state behind the add-a-payee form.
 *
 * Separated from the markup so the form itself is a description of the screen rather than a
 * hundred lines of state plumbing, and so the one rule worth stating — nothing is saved while a
 * required field is empty — sits in one readable function.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { Beneficiary, CreateBeneficiaryRequest } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import {
  destinationErrors,
  EMPTY_DRAFT,
  movementKeys,
  toDestination,
  TransferKind,
  useNameCheck,
  type DestinationDraft,
  type DestinationErrors,
} from '@/components/transfers';
import { browserApi } from '@/lib/api';

const STARTING_DRAFT: DestinationDraft = { ...EMPTY_DRAFT, kind: TransferKind.DOMESTIC };

/** What {@link usePayeeDraft} hands the form. */
export interface PayeeDraft {
  readonly draft: DestinationDraft;
  readonly nickname: string;
  readonly currency: CurrencyCode;
  readonly errors: DestinationErrors;
  readonly nicknameError: boolean;
  readonly nameCheck: ReturnType<typeof useNameCheck>;
  readonly create: UseMutationResult<Beneficiary, unknown, CreateBeneficiaryRequest>;
  readonly patch: (patch: Partial<DestinationDraft>) => void;
  readonly setNickname: (value: string) => void;
  readonly setCurrency: (value: CurrencyCode) => void;
  readonly checkName: () => void;
  readonly save: () => void;
}

/** Creates the payee and refreshes every list that shows one. */
function useCreatePayee(onSaved: (payee: Beneficiary) => void) {
  const cache = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateBeneficiaryRequest) =>
      (await browserApi().beneficiaries.create(body)).data,
    onSuccess: async (payee) => {
      await cache.invalidateQueries({ queryKey: movementKeys.beneficiaries.all });
      onSaved(payee);
    },
  });
}

/** @param onSaved where to go once the payee exists. */
export function usePayeeDraft(onSaved: (payee: Beneficiary) => void): PayeeDraft {
  const [draft, setDraft] = useState<DestinationDraft>(STARTING_DRAFT);
  const [nickname, setNickname] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('GBP');
  const [showErrors, setShowErrors] = useState(false);
  const nameCheck = useNameCheck();
  const create = useCreatePayee(onSaved);

  const errors = destinationErrors(draft);
  const destination = toDestination(draft);
  const missingNickname = nickname.trim() === '';

  return {
    draft,
    nickname,
    currency,
    errors: showErrors ? errors : {},
    nicknameError: showErrors && missingNickname,
    nameCheck,
    create,
    patch: (change) => setDraft((current) => ({ ...current, ...change })),
    setNickname,
    setCurrency,

    checkName: () => {
      if (destination && draft.accountName) {
        nameCheck.mutate({ destination, expectedName: draft.accountName });
      }
    },

    save: () => {
      const invalid = Object.keys(errors).length > 0 || missingNickname;
      setShowErrors(invalid);
      if (invalid || !destination) return;
      create.mutate({ nickname: nickname.trim(), destination, currency, isFavourite: false });
    },
  };
}
