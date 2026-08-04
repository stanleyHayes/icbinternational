'use client';

/**
 * Everything a customer can do to a card, sharing one invalidation.
 *
 * Freezing is the important one and it is deliberately not confirm-gated: "where is my card?" is a
 * question people answer while patting their pockets in a shop doorway, and a modal between them
 * and the switch is a modal that costs somebody their money. It is instantly reversible, which is
 * exactly what makes it safe to make instant.
 *
 * Reporting a card lost is the opposite — final, and gated accordingly by the screen that offers it.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { Card, CardControls, ReportCardRequest } from '@reliance/contracts';

import { movementKeys } from '@/components/transfers';
import { browserApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** The changes a card screen can make. */
export interface CardMutations {
  readonly setFrozen: UseMutationResult<Card, unknown, boolean>;
  readonly setPin: UseMutationResult<Card, unknown, string>;
  readonly setControls: UseMutationResult<Card, unknown, CardControls>;
  readonly report: UseMutationResult<Card, unknown, ReportCardRequest>;
  readonly rename: UseMutationResult<Card, unknown, string>;
}

/** @param cardId the card being changed. */
export function useCardMutations(cardId: string): CardMutations {
  const cache = useQueryClient();

  const refresh = async (): Promise<void> => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: movementKeys.cards.all }),
      cache.invalidateQueries({ queryKey: queryKeys.accounts.all }),
    ]);
  };

  const api = () => browserApi().cards;

  const setFrozen = useMutation({
    mutationFn: async (frozen: boolean) =>
      (frozen ? await api().freeze(cardId) : await api().unfreeze(cardId)).data,
    onSuccess: refresh,
  });

  const setPin = useMutation({
    mutationFn: async (pin: string) => (await api().setPin(cardId, { pin })).data,
    onSuccess: refresh,
  });

  const setControls = useMutation({
    mutationFn: async (controls: CardControls) => (await api().setControls(cardId, controls)).data,
    onSuccess: refresh,
  });

  const report = useMutation({
    mutationFn: async (body: ReportCardRequest) => (await api().report(cardId, body)).data,
    onSuccess: refresh,
  });

  const rename = useMutation({
    mutationFn: async (nickname: string) =>
      (await api().update(cardId, { nickname: nickname || null })).data,
    onSuccess: refresh,
  });

  return { setFrozen, setPin, setControls, report, rename };
}
