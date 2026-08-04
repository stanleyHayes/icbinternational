import { Injectable } from '@nestjs/common';

import {
  AccountStatus,
  CardStatus,
  TicketTopic,
  type Account,
  type CreateFraudReportRequest,
  type CursorQuery,
  type FraudReport,
  type Paginated,
} from '@reliance/contracts';

import { type PageResult } from '../../common/pagination/cursor.js';
import { AccountService, AccountStatusService } from '../accounts/index.js';
import { CardLifecycleService, CardService } from '../cards/index.js';
import { TicketOpenService } from '../tickets/index.js';

import { toContractFraudReport } from './fraud-report.mapper.js';
import { FraudReportStore, type FraudReportRecord } from './fraud-report.store.js';

const CARD_PAGE_SIZE = 100;

const KIND_LABEL: Record<CreateFraudReportRequest['kind'], string> = {
  CARD_FRAUD: 'Card fraud',
  ACCOUNT_TAKEOVER: 'Account takeover',
  PHISHING: 'Phishing attempt',
  SCAM_PAYMENT: 'Scam payment',
  IDENTITY_THEFT: 'Identity theft',
};

@Injectable()
export class FraudReportService {
  constructor(
    private readonly reports: FraudReportStore,
    private readonly accounts: AccountService,
    private readonly accountStatuses: AccountStatusService,
    private readonly cards: CardService,
    private readonly cardLifecycle: CardLifecycleService,
    private readonly ticketOpen: TicketOpenService,
  ) {}

  async create(input: {
    userId: string;
    request: CreateFraudReportRequest;
  }): Promise<FraudReportRecord> {
    const frozenCardIds = input.request.freezeCards ? await this.freezeCards(input.userId) : [];
    const frozenAccountIds = input.request.freezeAccounts
      ? await this.freezeAccounts(input.userId)
      : [];

    const ticket = await this.ticketOpen.open({
      userId: input.userId,
      request: {
        subject: `${KIND_LABEL[input.request.kind]} reported`,
        topic: TicketTopic.FRAUD,
        body: ticketBody(input.request, frozenCardIds, frozenAccountIds),
        attachmentIds: [],
        relatedTransactionId: input.request.transactionIds[0],
      },
    });

    return this.reports.insert({
      userId: input.userId,
      kind: input.request.kind,
      description: input.request.description,
      transactionIds: [...input.request.transactionIds],
      freezeCards: input.request.freezeCards,
      freezeAccounts: input.request.freezeAccounts,
      frozenCardIds,
      frozenAccountIds,
      ticketId: ticket.id,
    });
  }

  async list(userId: string, query: CursorQuery): Promise<Paginated<FraudReport>> {
    return toContractPage(await this.reports.listForUser({ userId, ...query }));
  }

  private async freezeCards(userId: string): Promise<string[]> {
    const frozen = new Set<string>();
    let cursor: string | undefined;

    do {
      const page = await this.cards.list({ userId, limit: CARD_PAGE_SIZE, cursor });
      for (const card of page.data) {
        if (card.status === CardStatus.FROZEN) {
          frozen.add(card.id);
          continue;
        }
        if (card.status !== CardStatus.ACTIVE) continue;

        const owned = await this.cards.requireOwned(userId, card.id);
        await this.cardLifecycle.freeze(owned);
        frozen.add(card.id);
      }

      cursor = page.page.hasMore ? (page.page.cursor ?? undefined) : undefined;
    } while (cursor);

    return [...frozen];
  }

  private async freezeAccounts(userId: string): Promise<string[]> {
    const frozen = new Set<string>();
    const accounts = await this.accounts.list(userId);

    for (const account of accounts) {
      if (account.status === AccountStatus.FROZEN) {
        frozen.add(account.id);
        continue;
      }
      if (!isFreezeableAccount(account)) continue;

      await this.accountStatuses.freeze({
        accountId: account.id,
        reason: 'Customer filed a fraud report.',
      });
      frozen.add(account.id);
    }

    return [...frozen];
  }
}

function toContractPage(page: PageResult<FraudReportRecord>): Paginated<FraudReport> {
  return { data: page.data.map(toContractFraudReport), page: page.page };
}

function isFreezeableAccount(account: Account): boolean {
  return (
    account.status === AccountStatus.ACTIVE ||
    account.status === AccountStatus.PENDING ||
    account.status === AccountStatus.DORMANT
  );
}

function ticketBody(
  request: CreateFraudReportRequest,
  frozenCardIds: readonly string[],
  frozenAccountIds: readonly string[],
): string {
  const lines = [
    `Fraud type: ${KIND_LABEL[request.kind]}`,
    '',
    'Customer report:',
    request.description,
    '',
    `Cards frozen: ${frozenCardIds.length > 0 ? frozenCardIds.join(', ') : 'none'}`,
    `Accounts frozen: ${frozenAccountIds.length > 0 ? frozenAccountIds.join(', ') : 'none'}`,
  ];

  if (request.transactionIds.length > 0) {
    lines.push('', 'Related transactions:', ...request.transactionIds.map((id) => `- ${id}`));
  }

  return lines.join('\n');
}
