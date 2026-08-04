'use client';

/**
 * One card on the wall.
 *
 * The art is the recognisable thing — a customer with three cards knows theirs by sight before
 * they read a word — so it leads, with the state beneath it in words as well as in tone. Frozen is
 * drawn on the art itself by `CardArt`, and repeated in the pill, because the desaturation alone
 * is not a message.
 */

import Link from 'next/link';

import type { Card } from '@reliance/contracts';
import { CardArt, cn, StatusPill } from '@reliance/ui';

import { laneRoutes } from '@/components/transfers';

import { artMedium, artNetwork, artTier, CARD_STATUS, cardName, expiryLabel } from './card-look';

/** Props for {@link CardTile}. */
export interface CardTileProps {
  readonly card: Card;
}

/**
 * @example <CardTile card={card} />
 */
export function CardTile({ card }: CardTileProps) {
  const look = CARD_STATUS[card.status];
  const name = cardName(card.nickname, card.format, card.last4);

  return (
    <li>
      <Link
        href={laneRoutes.cards.detail(card.id)}
        className={cn(
          'block rounded-xl p-1',
          'focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <CardArt
          holder={card.cardholderName}
          last4={card.last4}
          expiry={expiryLabel(card.expiryMonth, card.expiryYear)}
          medium={artMedium(card.format)}
          tier={artTier(card.tier)}
          network={artNetwork(card.scheme)}
          frozen={card.status === 'FROZEN'}
        />

        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <span className="min-w-0">
            <span className="text-fg block truncate text-sm font-medium">{name}</span>
            {card.isDefault ? (
              <span className="text-fg-muted block text-xs">Your default card</span>
            ) : null}
          </span>
          <StatusPill tone={look.tone} label={look.label} />
        </div>
      </Link>
    </li>
  );
}
