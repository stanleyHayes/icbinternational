'use client';

/**
 * Every card the customer holds.
 *
 * A wall rather than a table, because a card is a physical object people recognise by sight. Live
 * cards first; cards that have been replaced, lost or cancelled are kept but pushed below a
 * heading of their own, since their history still matters and their art should not compete with
 * the card in somebody's pocket.
 */

import { useQuery } from '@tanstack/react-query';

import type { Card } from '@reliance/contracts';

import { EmptyPanel, LinkButton } from '@/components/shell';
import { laneRoutes, movementKeys, QueryPanel, Section } from '@/components/transfers';
import { browserApi } from '@/lib/api';

import { CLOSED } from './card-look';
import { CardTile } from './card-tile';

const ORDER_CARD = <LinkButton href={laneRoutes.cards.order}>Order a card</LinkButton>;

const NO_CARDS = (
  <EmptyPanel
    title="You do not have a card yet"
    description="Order a virtual card and use it online within seconds, or have a physical one posted to you."
    action={ORDER_CARD}
  />
);

/** A grid of card art, in the order the bank lists them. */
function Wall({ cards }: { readonly cards: readonly Card[] }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {cards.map((card) => (
        <CardTile key={card.id} card={card} />
      ))}
    </ul>
  );
}

/**
 * @example <CardWall />
 */
export function CardWall() {
  const filters = {};
  const cards = useQuery({
    queryKey: movementKeys.cards.list(filters),
    queryFn: async () => (await browserApi().cards.list()).data,
  });

  return (
    <QueryPanel
      query={cards}
      skeletonRows={2}
      isEmpty={(list) => list.length === 0}
      empty={NO_CARDS}
    >
      {(list) => {
        const live = list.filter((card) => !CLOSED.has(card.status));
        const finished = list.filter((card) => CLOSED.has(card.status));

        return (
          <div className="flex flex-col gap-6">
            <Section title="Your cards" description="Tap a card to manage it." action={ORDER_CARD}>
              <Wall cards={live} />
            </Section>

            {finished.length > 0 ? (
              <Section
                title="Cards you no longer use"
                description="Kept so you can still see what was spent on them."
              >
                <Wall cards={finished} />
              </Section>
            ) : null}
          </div>
        );
      }}
    </QueryPanel>
  );
}
