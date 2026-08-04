import { CardStatus } from '@reliance/contracts';

/**
 * Which states a card may move to, and from where.
 *
 * A card's status is the answer to "can this be spent on", and every transition either
 * opens or closes that. Writing them as a table rather than as conditions scattered
 * across services means the whole lifecycle is readable in one screen, and a transition
 * nobody thought about — reactivating a stolen card, unfreezing a cancelled one — is
 * absent rather than accidentally permitted.
 *
 * The terminal states have no outgoing edges at all. `CANCELLED`, `LOST` and `STOLEN` are
 * ends: the remedy is a new card, never a resurrected one. A card that could come back
 * from `STOLEN` is a card whose thief only has to wait.
 */
const TRANSITIONS: Readonly<Record<CardStatus, readonly CardStatus[]>> = Object.freeze({
  [CardStatus.ORDERED]: [CardStatus.PRINTING, CardStatus.CANCELLED],
  [CardStatus.PRINTING]: [CardStatus.SHIPPED, CardStatus.CANCELLED],
  [CardStatus.SHIPPED]: [CardStatus.DELIVERED, CardStatus.LOST, CardStatus.CANCELLED],
  [CardStatus.DELIVERED]: [
    CardStatus.INACTIVE,
    CardStatus.ACTIVE,
    CardStatus.LOST,
    CardStatus.STOLEN,
    CardStatus.CANCELLED,
  ],
  [CardStatus.INACTIVE]: [
    CardStatus.ACTIVE,
    CardStatus.LOST,
    CardStatus.STOLEN,
    CardStatus.EXPIRED,
    CardStatus.CANCELLED,
  ],
  [CardStatus.ACTIVE]: [
    CardStatus.FROZEN,
    CardStatus.LOST,
    CardStatus.STOLEN,
    CardStatus.EXPIRED,
    CardStatus.CANCELLED,
  ],
  [CardStatus.FROZEN]: [
    CardStatus.ACTIVE,
    CardStatus.LOST,
    CardStatus.STOLEN,
    CardStatus.EXPIRED,
    CardStatus.CANCELLED,
  ],
  [CardStatus.LOST]: [],
  [CardStatus.STOLEN]: [],
  [CardStatus.EXPIRED]: [],
  [CardStatus.CANCELLED]: [],
});

/** Statuses a card can be activated from: it has to have reached the customer first. */
export const ACTIVATABLE_STATUSES: readonly CardStatus[] = Object.freeze([
  CardStatus.DELIVERED,
  CardStatus.INACTIVE,
]);

/** Statuses from which a card can still be reported lost, stolen or damaged. */
export const REPORTABLE_STATUSES: readonly CardStatus[] = Object.freeze([
  CardStatus.SHIPPED,
  CardStatus.DELIVERED,
  CardStatus.INACTIVE,
  CardStatus.ACTIVE,
  CardStatus.FROZEN,
]);

/** Statuses a card can be cancelled from. Cancelling an ended card is a no-op, not a step. */
export const CANCELLABLE_STATUSES: readonly CardStatus[] = Object.freeze([
  CardStatus.ORDERED,
  CardStatus.PRINTING,
  CardStatus.SHIPPED,
  CardStatus.DELIVERED,
  CardStatus.INACTIVE,
  CardStatus.ACTIVE,
  CardStatus.FROZEN,
]);

/** Statuses on which a card can be spent. The one question authorisation really asks. */
export const SPENDABLE_STATUSES: readonly CardStatus[] = Object.freeze([CardStatus.ACTIVE]);

/** Whether a card in `from` may move to `to`. */
export function canTransition(from: CardStatus, to: CardStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The states a card in this one may move to. */
export function transitionsFrom(status: CardStatus): readonly CardStatus[] {
  return TRANSITIONS[status];
}

/** Whether the card has reached an end it cannot come back from. */
export function isTerminal(status: CardStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
