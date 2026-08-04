import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { type Card, type CardStatus, type Paginated } from '@reliance/contracts';

import { buildPage } from '../../common/pagination/cursor.js';

import { cardChangedUnderneath, cardNotFound } from './card.errors.js';
import { toContractCard, toIso } from './card.mapper.js';
import { CardStore, type CardPatchFields, type CardRecord } from './card.store.js';

/** What a client may change about a card without touching its controls. */
export interface UpdateCardInput {
  readonly nickname?: string | null;
  readonly isDefault?: boolean;
}

/**
 * Reading and renaming a customer's cards.
 *
 * Every read resolves the card **through** the caller's user id rather than fetching it
 * and checking afterwards. There is no code path here that can load a card by id alone,
 * which makes an attempt on somebody else's card structurally impossible rather than
 * merely guarded — and why a wrong id answers "not found" instead of "forbidden", since a
 * 403 would confirm the id belongs to someone.
 */
@Injectable()
export class CardService {
  constructor(private readonly cards: CardStore) {}

  /** A page of the customer's cards, newest first. */
  async list(input: {
    userId: string;
    accountId?: string;
    status?: CardStatus;
    cursor?: string;
    limit: number;
  }): Promise<Paginated<Card>> {
    const { records } = await this.cards.list(input);
    const page = buildPage({
      records,
      limit: input.limit,
      toCursor: (record) => ({ sortValue: toIso(record.orderedAt), id: record.id }),
    });

    return { data: page.data.map((record) => toContractCard(record)), page: page.page };
  }

  /** One card, or a 404 — including when it exists but belongs to somebody else. */
  async get(userId: string, cardId: string): Promise<Card> {
    return toContractCard(await this.requireOwned(userId, cardId));
  }

  /**
   * Renames a card, or makes it the account's default.
   *
   * Promoting a default demotes the others in the same write path, so an account cannot
   * end up with two defaults or none. Which card is default decides where a merchant's
   * recurring charge lands, and "none" is not a state the customer can be left in.
   */
  async update(input: { userId: string; cardId: string; changes: UpdateCardInput }): Promise<Card> {
    const card = await this.requireOwned(input.userId, input.cardId);
    const fields = toPatchFields(input.changes);

    if (Object.keys(fields).length === 0) return toContractCard(card);

    const patched = await this.cards.patch({ cardId: card.id, fields });
    if (!patched) throw cardChangedUnderneath(card.id);

    if (input.changes.isDefault === true) {
      await this.cards.clearDefault({ accountId: card.accountId, exceptCardId: card.id });
    }

    return toContractCard(patched);
  }

  /**
   * The card, resolved through its owner.
   *
   * @throws {AppError} `CARD_NOT_FOUND` when there is no such card on this profile.
   */
  async requireOwned(userId: string, cardId: string, session?: ClientSession): Promise<CardRecord> {
    const card = await this.cards.findById(cardId, session);
    if (!card || card.userId !== userId) throw cardNotFound(cardId);
    return card;
  }

  /** The card without an ownership check. For the rail, which authorises by card id. */
  async require(cardId: string, session?: ClientSession): Promise<CardRecord> {
    const card = await this.cards.findById(cardId, session);
    if (!card) throw cardNotFound(cardId);
    return card;
  }
}

/** Only the fields the client actually sent, so an absent key is not read as null. */
function toPatchFields(changes: UpdateCardInput): CardPatchFields {
  return {
    ...(changes.nickname === undefined ? {} : { nickname: changes.nickname }),
    ...(changes.isDefault === undefined ? {} : { isDefault: changes.isDefault }),
  };
}
