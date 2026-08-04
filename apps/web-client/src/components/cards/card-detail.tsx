'use client';

/**
 * One card, and everything that can be done to it.
 *
 * The panels appear in the order somebody needs them: the card itself and its state, then the
 * thing they came for. A card that has not been activated shows the activation form and nothing
 * else that would fail — offering "show my card details" for a card still in the post is an
 * invitation to a support call.
 */

import { useQuery } from '@tanstack/react-query';

import { CardStatus, type Card } from '@reliance/contracts';
import { CardArt, StatusPill } from '@reliance/ui';

import { movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { ActivateForm } from './activate-form';
import { CardActions } from './card-actions';
import {
  artMedium,
  artNetwork,
  artTier,
  CARD_STATUS,
  cardName,
  CLOSED,
  expiryLabel,
} from './card-look';
import { CardTransactions } from './card-transactions';
import { ControlsForm } from './controls-form';
import { PinForm } from './pin-form';
import { RevealPanel } from './reveal-panel';
import { useCardMutations } from './use-card-mutations';

/** Props for {@link CardDetail}. */
export interface CardDetailProps {
  readonly cardId: string;
}

/** States where the card has not yet been brought to life. */
const AWAITING_ACTIVATION: ReadonlySet<CardStatus> = new Set([
  CardStatus.DELIVERED,
  CardStatus.INACTIVE,
]);

/** The art, the state and the switches that go with it. */
function Overview({
  card,
  mutations,
}: {
  readonly card: Card;
  readonly mutations: ReturnType<typeof useCardMutations>;
}) {
  const look = CARD_STATUS[card.status];

  return (
    <Section
      title={cardName(card.nickname, card.format, card.last4)}
      description={look.detail}
      action={<StatusPill tone={look.tone} label={look.label} />}
    >
      <div className="flex flex-col gap-6">
        <CardArt
          holder={card.cardholderName}
          last4={card.last4}
          expiry={expiryLabel(card.expiryMonth, card.expiryYear)}
          medium={artMedium(card.format)}
          tier={artTier(card.tier)}
          network={artNetwork(card.scheme)}
          frozen={card.status === CardStatus.FROZEN}
        />
        <CardActions card={card} mutations={mutations} />
      </div>
    </Section>
  );
}

function DetailBody({ card }: { readonly card: Card }) {
  const mutations = useCardMutations(card.id);
  const usable = !CLOSED.has(card.status) && !AWAITING_ACTIVATION.has(card.status);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <div className="flex flex-col gap-6">
        <Overview card={card} mutations={mutations} />
        {AWAITING_ACTIVATION.has(card.status) ? <ActivateForm cardId={card.id} /> : null}
        {usable ? <CardTransactions cardId={card.id} /> : null}
      </div>

      {usable ? (
        <div className="flex flex-col gap-6">
          <RevealPanel cardId={card.id} />
          <PinForm pinSet={card.pinSet} mutation={mutations.setPin} />
          <ControlsForm
            controls={card.controls}
            currency={card.currency}
            mutation={mutations.setControls}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * @example <CardDetail cardId={cardId} />
 */
export function CardDetail({ cardId }: CardDetailProps) {
  const card = useQuery({
    queryKey: movementKeys.cards.detail(cardId),
    queryFn: async () => (await browserApi().cards.get(cardId)).data,
  });

  return (
    <QueryPanel query={card} skeletonRows={3}>
      {(data) => <DetailBody card={data} />}
    </QueryPanel>
  );
}
