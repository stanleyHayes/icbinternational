import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { CardFormat, CardStatus, type CardTier, type IssueCardRequest } from '@reliance/contracts';
import { type CurrencyCode } from '@reliance/money';

import { TransactionRunner } from '../../../database/transaction.runner.js';
import { AccountService, assertAccountUsable, type AccountRecord } from '../../accounts/index.js';
import { CARD_TRANSACTION_LABEL, MAX_CARDS_PER_ACCOUNT } from '../card.constants.js';
import { tooManyCards } from '../card.errors.js';
import { CardStore, type CardRecord } from '../card.store.js';

import { CardFactory, schemeForTier } from './card.factory.js';

/** Statuses that occupy one of the account's card slots. */
const LIVE_STATUSES: readonly CardStatus[] = [
  CardStatus.ORDERED,
  CardStatus.PRINTING,
  CardStatus.SHIPPED,
  CardStatus.DELIVERED,
  CardStatus.INACTIVE,
  CardStatus.ACTIVE,
  CardStatus.FROZEN,
];

/** Everything issuing needs that is not on the request. */
export interface IssueCardInput {
  readonly userId: string;
  readonly request: IssueCardRequest;
  /** Set when this card takes over from one that was lost, stolen or expiring. */
  readonly replacesCardId?: string;
  readonly session?: ClientSession;
}

/**
 * Issuing a card.
 *
 * Two formats, two very different promises. A **virtual** card exists the moment the
 * request returns and can be spent immediately — there is nothing in the post and nothing
 * to activate. A **physical** card is a manufacturing order: it goes out `ORDERED` and
 * spends the next few days moving through print, dispatch and delivery before the
 * customer can activate it.
 *
 * What is identical across both is that the card number is minted, tokenised and
 * discarded inside `CardFactory`. Nothing on this path ever holds a PAN, which is why
 * nothing on this path can leak one.
 */
@Injectable()
export class CardIssuingService {
  private readonly logger = new Logger(CardIssuingService.name);

  constructor(
    private readonly cards: CardStore,
    private readonly accounts: AccountService,
    private readonly factory: CardFactory,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Issues a card against one of the customer's accounts.
   *
   * @throws {AppError} `ACCOUNT_NOT_FOUND` for an account that is not theirs; whatever
   *   the account-usability check refuses; `LIMIT_EXCEEDED` when the account is full.
   */
  async issue(input: IssueCardInput): Promise<CardRecord> {
    const account = await this.accounts.requireOwned({
      userId: input.userId,
      accountId: input.request.accountId,
    });
    assertAccountUsable(account);

    const card = await this.runner.runIn(
      input.session,
      (session) => this.issueWithin(input, account, session),
      { label: CARD_TRANSACTION_LABEL.ISSUE },
    );

    this.logger.log(
      `Issued ${card.format.toLowerCase()} ${card.scheme} card ${card.id} on ${account.id}`,
    );
    return card;
  }

  private async issueWithin(
    input: IssueCardInput,
    account: AccountRecord,
    session: ClientSession,
  ): Promise<CardRecord> {
    await this.assertSlotAvailable(account.id, session);

    const tier = input.request.tier as CardTier;
    const draft = await this.factory.build({
      accountId: account.id,
      userId: input.userId,
      currency: account.currency as CurrencyCode,
      format: input.request.format,
      scheme: schemeForTier(tier),
      tier,
      nickname: input.request.nickname ?? null,
      replacesCardId: input.replacesCardId ?? null,
    });

    // The first card on an account becomes its default: a recurring charge has to land
    // somewhere, and "nowhere" is not an answer a merchant can act on.
    const existing = await this.cards.listByAccount(account.id, session);
    const isFirst = existing.every((card) => !LIVE_STATUSES.includes(card.status));

    return this.cards.insert({ ...draft, isDefault: isFirst }, session);
  }

  /**
   * Refuses a card the account has no room for.
   *
   * The ceiling counts every card that is not finished — including one still in the post
   * — because a customer with five cards in production has five cards, whatever their
   * status says. Counting only active ones would let somebody order an unbounded number
   * by never activating them.
   */
  private async assertSlotAvailable(accountId: string, session: ClientSession): Promise<void> {
    const cards = await this.cards.listByAccount(accountId, session);
    const live = cards.filter((card) => LIVE_STATUSES.includes(card.status));

    if (live.length >= MAX_CARDS_PER_ACCOUNT) {
      throw tooManyCards(accountId, MAX_CARDS_PER_ACCOUNT);
    }
  }
}

/** Whether a card of this format is usable the moment it is issued. */
export function isInstantlyUsable(format: CardFormat): boolean {
  return format === CardFormat.VIRTUAL;
}
