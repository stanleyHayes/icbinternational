/**
 * The card lifecycle actions an operator can take.
 *
 * Freezing is reversible and instant, which makes it the right answer to "I've lost my
 * card, I think"; reporting it lost or stolen is not reversible and orders a replacement,
 * which makes it the right answer to "someone has used my card". The console keeps them
 * separate for that reason rather than collapsing both into a single "block".
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  type CardFormat,
  type CardTier,
  type Card,
  type ReportCardRequest,
} from '@reliance/contracts';

import { opsKeys } from '@/components/ops';
import { useApiClient } from '@/lib/api-client';

/** What a new card is being issued as. */
export interface IssueRequest {
  readonly accountId: string;
  readonly format: CardFormat;
  readonly tier: CardTier;
  readonly nickname?: string;
}

/** Every lifecycle action, sharing one cache invalidation. */
export function useCardActions() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const refresh = (): void => {
    queryClient.invalidateQueries({ queryKey: opsKeys.all('cards') });
  };

  const freeze = useMutation({
    mutationFn: async (card: Card) => client.cards.freeze(card.id),
    onSuccess: refresh,
  });

  const unfreeze = useMutation({
    mutationFn: async (card: Card) => client.cards.unfreeze(card.id),
    onSuccess: refresh,
  });

  const report = useMutation({
    mutationFn: async (input: { readonly card: Card; readonly body: ReportCardRequest }) =>
      client.cards.report(input.card.id, input.body),
    onSuccess: refresh,
  });

  const cancel = useMutation({
    mutationFn: async (card: Card) => client.cards.cancel(card.id),
    onSuccess: refresh,
  });

  const issue = useMutation({
    mutationFn: async (request: IssueRequest) =>
      client.cards.issue({
        accountId: request.accountId,
        format: request.format,
        tier: request.tier,
        deliveryAddressOverride: false,
        ...(request.nickname ? { nickname: request.nickname } : {}),
      }),
    onSuccess: refresh,
  });

  return { freeze, unfreeze, report, cancel, issue };
}
