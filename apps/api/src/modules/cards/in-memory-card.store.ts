import { Injectable } from '@nestjs/common';

import { CardStatus } from '@reliance/contracts';

import { decodeCursor } from '../../common/pagination/cursor.js';

import {
  CardStore,
  type AdminCardQuery,
  type CardPatchInput,
  type CardQuery,
  type CardRecord,
  type ExpiredCardQuery,
  type NewCard,
} from './card.store.js';

/** Statuses a card can lapse from. Mirrors the repository's, deliberately. */
const EXPIRABLE_STATUSES: readonly CardStatus[] = [
  CardStatus.ACTIVE,
  CardStatus.INACTIVE,
  CardStatus.FROZEN,
  CardStatus.DELIVERED,
];

/**
 * An honest, in-memory `CardStore`.
 *
 * The rule that matters is reproduced exactly: {@link patch} honours
 * `expectedStatuses` and returns null when the guard misses. A fake that patched
 * unconditionally would let the concurrency tests pass while the production path could
 * still let an authorisation approve against a card somebody froze a millisecond earlier.
 *
 * Shipped in `src` rather than in `__tests__` because it is the store the authorisation
 * suite runs the whole rail against, and a fake living beside its abstraction cannot
 * drift away from it unnoticed.
 */
@Injectable()
export class InMemoryCardStore extends CardStore {
  private readonly byId = new Map<string, CardRecord>();

  override async insert(card: NewCard): Promise<CardRecord> {
    this.byId.set(card.id, { ...card });
    return { ...card };
  }

  override async findById(id: string): Promise<CardRecord | null> {
    return this.byId.get(id) ?? null;
  }

  override async listByAccount(accountId: string): Promise<CardRecord[]> {
    return this.newestFirst([...this.byId.values()].filter((card) => card.accountId === accountId));
  }

  override async list(query: CardQuery): Promise<{ records: CardRecord[] }> {
    const before = query.cursor ? decodeCursor(query.cursor) : null;
    const cutOff = before ? new Date(before.sortValue).getTime() : null;

    const matches = [...this.byId.values()].filter(
      (card) =>
        card.userId === query.userId &&
        (!query.accountId || card.accountId === query.accountId) &&
        (!query.status || card.status === query.status) &&
        (cutOff === null || card.orderedAt.getTime() < cutOff),
    );

    return { records: this.newestFirst(matches).slice(0, query.limit + 1) };
  }

  override async patch(input: CardPatchInput): Promise<CardRecord | null> {
    const current = this.byId.get(input.cardId);
    if (!current) return null;
    if (input.expectedStatuses && !input.expectedStatuses.includes(current.status)) return null;

    const patched: CardRecord = { ...current, ...input.fields };
    this.byId.set(patched.id, patched);
    return patched;
  }

  override async clearDefault(input: { accountId: string; exceptCardId: string }): Promise<void> {
    for (const card of this.byId.values()) {
      const shouldClear =
        card.accountId === input.accountId && card.id !== input.exceptCardId && card.isDefault;
      if (shouldClear) this.byId.set(card.id, { ...card, isDefault: false });
    }
  }

  override async listAdmin(query: AdminCardQuery): Promise<{ records: CardRecord[] }> {
    const before = query.cursor ? decodeCursor(query.cursor) : null;
    const cutOff = before ? new Date(before.sortValue).getTime() : null;
    const all = [...this.byId.values()].filter(
      (card) => cutOff === null || card.orderedAt.getTime() < cutOff,
    );
    return { records: this.newestFirst(all).slice(0, query.limit + 1) };
  }

  override async listExpired(query: ExpiredCardQuery): Promise<CardRecord[]> {
    return [...this.byId.values()]
      .filter(
        (card) =>
          card.expiresAt.getTime() <= query.asOf.getTime() &&
          EXPIRABLE_STATUSES.includes(card.status),
      )
      .sort((left, right) => left.expiresAt.getTime() - right.expiresAt.getTime())
      .slice(0, query.limit);
  }

  /** Every stored card, for assertions. */
  all(): CardRecord[] {
    return [...this.byId.values()];
  }

  /** Empties the store. Cheaper than rebuilding the module between tests. */
  reset(): void {
    this.byId.clear();
  }

  private newestFirst(cards: CardRecord[]): CardRecord[] {
    return cards.sort((left, right) => right.orderedAt.getTime() - left.orderedAt.getTime());
  }
}
