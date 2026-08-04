/**
 * Turning a card's contract fields into something to look at and read.
 *
 * `CardArt` speaks its own vocabulary — `physical`/`virtual`, `standard`/`premium`/`business`,
 * `visa`/`mastercard` — because it is a brand asset rather than a view of the contract. This is
 * the one place that translates, so a new tier is a line here instead of a cast at four call sites.
 */

import { CardFormat, CardScheme, CardStatus, CardTier } from '@reliance/contracts';
import type { CardMedium, CardNetwork, CardTier as ArtTier, Tone } from '@reliance/ui';

/** How a card's state reads, and how it is toned. */
export interface CardLook {
  readonly label: string;
  readonly tone: Tone;
  /** One line saying what the customer can do about it, when there is something. */
  readonly detail?: string;
}

/** Every card state, in the customer's words. */
export const CARD_STATUS: Readonly<Record<CardStatus, CardLook>> = {
  [CardStatus.ORDERED]: { label: 'Ordered', tone: 'info', detail: 'We are getting it ready.' },
  [CardStatus.PRINTING]: {
    label: 'Being made',
    tone: 'info',
    detail: 'It will be posted shortly.',
  },
  [CardStatus.SHIPPED]: {
    label: 'On its way',
    tone: 'info',
    detail: 'Allow three to five working days for it to arrive.',
  },
  [CardStatus.DELIVERED]: {
    label: 'Ready to activate',
    tone: 'pending',
    detail: 'Activate it with the last four digits and a PIN of your choosing.',
  },
  [CardStatus.INACTIVE]: {
    label: 'Not activated',
    tone: 'pending',
    detail: 'Activate it before you use it.',
  },
  [CardStatus.ACTIVE]: { label: 'Active', tone: 'credit' },
  [CardStatus.FROZEN]: {
    label: 'Frozen',
    tone: 'pending',
    detail: 'Nothing can be spent on it until you unfreeze it.',
  },
  [CardStatus.LOST]: {
    label: 'Reported lost',
    tone: 'danger',
    detail: 'This card can no longer be used.',
  },
  [CardStatus.STOLEN]: {
    label: 'Reported stolen',
    tone: 'danger',
    detail: 'This card can no longer be used.',
  },
  [CardStatus.EXPIRED]: { label: 'Expired', tone: 'neutral' },
  [CardStatus.CANCELLED]: { label: 'Cancelled', tone: 'neutral' },
};

/** States where the card can actually be spent on. */
export const SPENDABLE: ReadonlySet<CardStatus> = new Set([CardStatus.ACTIVE, CardStatus.FROZEN]);

/** States where the card is finished and only its history remains. */
export const CLOSED: ReadonlySet<CardStatus> = new Set([
  CardStatus.LOST,
  CardStatus.STOLEN,
  CardStatus.EXPIRED,
  CardStatus.CANCELLED,
]);

const ART_TIER: Readonly<Record<CardTier, ArtTier>> = {
  [CardTier.STANDARD]: 'standard',
  [CardTier.PREMIUM]: 'premium',
  [CardTier.METAL]: 'premium',
};

const ART_NETWORK: Readonly<Record<CardScheme, CardNetwork>> = {
  [CardScheme.VISA]: 'visa',
  [CardScheme.MASTERCARD]: 'mastercard',
};

/** The card art's tier for a contract tier. */
export function artTier(tier: CardTier): ArtTier {
  return ART_TIER[tier];
}

/** The card art's network for a contract scheme. */
export function artNetwork(scheme: CardScheme): CardNetwork {
  return ART_NETWORK[scheme];
}

/** The card art's medium for a contract format. */
export function artMedium(format: CardFormat): CardMedium {
  return format === CardFormat.VIRTUAL ? 'virtual' : 'physical';
}

const MONTH_DIGITS = 2;
const YEAR_DIGITS = -2;

/** `MM/YY`, as embossed. */
export function expiryLabel(month: number, year: number): string {
  return `${String(month).padStart(MONTH_DIGITS, '0')}/${String(year).slice(YEAR_DIGITS)}`;
}

/** What the customer calls this card, falling back to something recognisable. */
export function cardName(nickname: string | null, format: CardFormat, last4: string): string {
  if (nickname) return nickname;
  return `${format === CardFormat.VIRTUAL ? 'Virtual card' : 'Debit card'} ending ${last4}`;
}
