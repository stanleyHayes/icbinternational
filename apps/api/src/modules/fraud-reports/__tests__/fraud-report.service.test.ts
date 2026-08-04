import { AccountStatus, CardStatus, TicketTopic, type CursorQuery } from '@reliance/contracts';

import { type PageResult } from '../../../common/pagination/cursor.js';
import { FraudReportService } from '../fraud-report.service.js';
import { FraudReportStore, type FraudReportListQuery, type FraudReportRecord } from '../fraud-report.store.js';

describe('FraudReportService', () => {
  it('opens a fraud ticket and freezes eligible cards and accounts', async () => {
    const store = new RecordingFraudReportStore();
    const accounts = new FakeAccountService([
      { id: 'acc_active', status: AccountStatus.ACTIVE },
      { id: 'acc_frozen', status: AccountStatus.FROZEN },
      { id: 'acc_closed', status: AccountStatus.CLOSED },
    ]);
    const accountStatuses = new FakeAccountStatusService();
    const cards = new FakeCardService([
      { id: 'crd_active', status: CardStatus.ACTIVE },
      { id: 'crd_frozen', status: CardStatus.FROZEN },
      { id: 'crd_cancelled', status: CardStatus.CANCELLED },
    ]);
    const lifecycle = new FakeCardLifecycleService();
    const tickets = new FakeTicketOpenService();
    const service = new FraudReportService(
      store,
      accounts as never,
      accountStatuses as never,
      cards as never,
      lifecycle as never,
      tickets as never,
    );

    const created = await service.create({
      userId: 'usr_test',
      request: {
        kind: 'SCAM_PAYMENT',
        description: 'A caller told me to move money to a safe account.',
        transactionIds: ['txn_123'],
        freezeCards: true,
        freezeAccounts: true,
      },
    });

    expect(created.ticketId).toBe('tkt_fraud');
    expect(created.frozenCardIds).toEqual(['crd_active', 'crd_frozen']);
    expect(created.frozenAccountIds).toEqual(['acc_active', 'acc_frozen']);
    expect(accountStatuses.calls).toEqual([{ accountId: 'acc_active', reason: 'Customer filed a fraud report.' }]);
    expect(lifecycle.calls).toEqual(['crd_active']);
    expect(tickets.calls[0]).toMatchObject({
      userId: 'usr_test',
      request: {
        topic: TicketTopic.FRAUD,
        subject: 'Scam payment reported',
        relatedTransactionId: 'txn_123',
      },
    });
  });

  it('leaves assets alone when the customer opts out of freezing', async () => {
    const service = new FraudReportService(
      new RecordingFraudReportStore(),
      new FakeAccountService([]) as never,
      new FakeAccountStatusService() as never,
      new FakeCardService([]) as never,
      new FakeCardLifecycleService() as never,
      new FakeTicketOpenService() as never,
    );

    const created = await service.create({
      userId: 'usr_test',
      request: {
        kind: 'PHISHING',
        description: 'I entered my details on a fake website.',
        transactionIds: [],
        freezeCards: false,
        freezeAccounts: false,
      },
    });

    expect(created.frozenCardIds).toEqual([]);
    expect(created.frozenAccountIds).toEqual([]);
  });

  it('lists stored reports as a contract page', async () => {
    const store = new RecordingFraudReportStore();
    store.records.push({
      id: 'frp_01K1N00000000000000000001',
      reference: 'frp_01K1N00000000000000000001',
      userId: 'usr_test',
      kind: 'CARD_FRAUD',
      description: 'Card was used somewhere else.',
      transactionIds: [],
      freezeCards: true,
      freezeAccounts: false,
      frozenCardIds: ['crd_active'],
      frozenAccountIds: [],
      ticketId: 'tkt_fraud',
      createdAt: new Date('2026-08-04T10:00:00.000Z'),
      updatedAt: new Date('2026-08-04T10:00:00.000Z'),
    });
    const service = new FraudReportService(
      store,
      new FakeAccountService([]) as never,
      new FakeAccountStatusService() as never,
      new FakeCardService([]) as never,
      new FakeCardLifecycleService() as never,
      new FakeTicketOpenService() as never,
    );

    const page = await service.list('usr_test', { limit: 25 } as CursorQuery);

    expect(page.data).toEqual([
      {
        id: 'frp_01K1N00000000000000000001',
        reference: 'frp_01K1N00000000000000000001',
        frozenCardIds: ['crd_active'],
        frozenAccountIds: [],
        ticketId: 'tkt_fraud',
        createdAt: '2026-08-04T10:00:00.000Z',
      },
    ]);
  });
});

class RecordingFraudReportStore extends FraudReportStore {
  records: FraudReportRecord[] = [];

  override async insert(row: Omit<FraudReportRecord, 'id' | 'reference' | 'createdAt' | 'updatedAt'>) {
    const record: FraudReportRecord = {
      id: `frp_${String(this.records.length + 1).padStart(26, '0')}`,
      reference: `frp_${String(this.records.length + 1).padStart(26, '0')}`,
      ...row,
      createdAt: new Date('2026-08-04T10:00:00.000Z'),
      updatedAt: new Date('2026-08-04T10:00:00.000Z'),
    };
    this.records.push(record);
    return record;
  }

  override async listForUser(query: FraudReportListQuery): Promise<PageResult<FraudReportRecord>> {
    return {
      data: this.records.filter((record) => record.userId === query.userId).slice(0, query.limit),
      page: {
        cursor: null,
        limit: query.limit,
        hasMore: false,
      },
    };
  }
}

class FakeAccountService {
  constructor(
    private readonly accounts: Array<{
      id: string;
      status: AccountStatus;
    }>,
  ) {}

  async list() {
    return this.accounts;
  }
}

class FakeAccountStatusService {
  calls: Array<{ accountId: string; reason: string }> = [];

  async freeze(input: { accountId: string; reason: string }) {
    this.calls.push(input);
    return input;
  }
}

class FakeCardService {
  constructor(
    private readonly cards: Array<{
      id: string;
      status: CardStatus;
    }>,
  ) {}

  async list(input: { limit: number; cursor?: string }) {
    const start = input.cursor ? Number(input.cursor.slice('cursor_'.length)) : 0;
    const data = this.cards.slice(start, start + input.limit);
    const next = start + input.limit;

    return {
      data,
      page: {
        cursor: next < this.cards.length ? `cursor_${next}` : null,
        limit: input.limit,
        hasMore: next < this.cards.length,
      },
    };
  }

  async requireOwned(_userId: string, cardId: string) {
    return { id: cardId };
  }
}

class FakeCardLifecycleService {
  calls: string[] = [];

  async freeze(card: { id: string }) {
    this.calls.push(card.id);
    return card;
  }
}

class FakeTicketOpenService {
  calls: Array<{
    userId: string;
    request: {
      subject: string;
      topic: TicketTopic;
      body: string;
      attachmentIds: string[];
      relatedTransactionId?: string;
    };
  }> = [];

  async open(input: (typeof this.calls)[number]) {
    this.calls.push(input);
    return { id: 'tkt_fraud' };
  }
}
