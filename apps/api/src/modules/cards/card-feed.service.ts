import { Injectable } from '@nestjs/common';

import {
  type AuthorisationStatus,
  type CardAuthorisation,
  type Paginated,
  type Transaction,
} from '@reliance/contracts';

import { buildPage } from '../../common/pagination/cursor.js';
import { TransactionStore } from '../transactions/repositories/transaction.store.js';
import { toTransactionResponse } from '../transactions/transaction.presenter.js';

import {
  AuthorisationStore,
  type AuthorisationRecord,
} from './authorisation/authorisation.store.js';
import { toContractAuthorisation, toIso } from './card.mapper.js';
import { CardService } from './card.service.js';

/**
 * The two feeds a card has, and why they are not the same feed.
 *
 * **Transactions** are the statement: money that actually moved, one row per capture,
 * with a running balance. **Authorisations** are the card's own history: approvals *and*
 * refusals, including everything the customer's controls stopped. A declined payment has
 * no statement row — nothing moved — and it is the row a customer most often wants to
 * see, which is why both exist.
 *
 * A card's transactions are resolved through its authorisations rather than by filtering
 * the account. Several cards can draw on one account, and "show me what I spent on this
 * card" cannot be answered by an account-wide query.
 */
@Injectable()
export class CardFeedService {
  constructor(
    private readonly cards: CardService,
    private readonly authorisations: AuthorisationStore,
    private readonly transactions: TransactionStore,
  ) {}

  /** Statement rows produced by one card, newest first. */
  async transactionsFor(input: {
    userId: string;
    cardId: string;
    cursor?: string;
    limit: number;
  }): Promise<Paginated<Transaction>> {
    const card = await this.cards.requireOwned(input.userId, input.cardId);
    const { records } = await this.authorisations.list({
      userId: input.userId,
      cardId: card.id,
      limit: input.limit,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });

    const page = buildPage({
      records,
      limit: input.limit,
      toCursor: (record) => ({ sortValue: toIso(record.authorisedAt), id: record.id }),
    });

    return { data: await this.rowsFor(page.data), page: page.page };
  }

  /** The card's authorisation history — approvals and declines alike. */
  async authorisationsFor(input: {
    userId: string;
    cardId?: string;
    status?: AuthorisationStatus;
    cursor?: string;
    limit: number;
  }): Promise<Paginated<CardAuthorisation>> {
    const { records } = await this.authorisations.list(input);
    const page = buildPage({
      records,
      limit: input.limit,
      toCursor: (record) => ({ sortValue: toIso(record.authorisedAt), id: record.id }),
    });

    return { data: page.data.map((record) => toContractAuthorisation(record)), page: page.page };
  }

  /**
   * Loads the statement row behind each captured authorisation.
   *
   * Authorisations without a row — declined, reversed, still pending capture — drop out
   * rather than appearing as blanks. The page size is bounded by the contract's maximum,
   * so the read is bounded too.
   */
  private async rowsFor(records: readonly AuthorisationRecord[]): Promise<Transaction[]> {
    const rows: Transaction[] = [];

    for (const record of records) {
      if (!record.transactionId) continue;
      const row = await this.transactions.findByPublicId(record.transactionId);
      if (row) rows.push(toTransactionResponse(row));
    }

    return rows;
  }
}
