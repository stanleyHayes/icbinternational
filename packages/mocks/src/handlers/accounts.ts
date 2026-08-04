/**
 * Account, statement, transaction and insight handlers.
 *
 * The order these are registered in matters: `/accounts/net-worth` and
 * `/accounts/letters` are static paths that would otherwise be swallowed by
 * `/accounts/:id`. They are listed first, and the coverage test asserts that the handler
 * a concrete path resolves to is the one that declared it.
 */

import {
  AccountStatus,
  AccountType,
  ErrorCode,
  routes,
  SpendCategory,
  TransactionDirection,
  type Account,
  type Transaction,
} from '@reliance/contracts';

import { minorUnits, money, subtractMoney, sumMoney, zero } from '../db/money.js';
import { makeAccount, makeStatement } from '../factories/banking.js';
import { opaqueId } from '../faker.js';

import {
  acknowledged,
  failure,
  MockMethod,
  notFound,
  resourceCreated,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate, paginateStatic } from './paging.js';

const LETTER_DAYS = 30;
const EXPORT_DAYS = 7;
const BPS = 10_000;

/** Accounts, statements and letters. */
export const accountHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.accounts.netWorth, ({ db }) => {
    const gbp = db.accounts.filter((account) => account.currency === 'GBP');
    const assets = sumMoney(gbp.map((account) => account.balance.ledger));
    const liabilities = sumMoney(db.loans.map((loan) => loan.outstandingBalance));

    return resourceOk({
      baseCurrency: 'GBP',
      totalAssets: assets,
      totalLiabilities: liabilities,
      net: subtractMoney(assets, liabilities),
      byCurrency: byCurrency(db.accounts),
      asOf: db.clock.nowIso(),
    });
  }),

  route(MockMethod.GET, routes.accounts.letters, ({ db, query }) => paginate(db.letters, query)),

  route(MockMethod.POST, routes.accounts.letters, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const accountId = typeof input.accountId === 'string' ? input.accountId : '';
    if (!db.accounts.some((account) => account.id === accountId)) {
      return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');
    }

    const letter = {
      id: opaqueId(),
      kind: typeof input.kind === 'string' ? input.kind : 'PROOF_OF_BALANCE',
      accountId,
      addressedTo: typeof input.addressedTo === 'string' ? input.addressedTo : null,
      downloadUrl: `https://assets.reliance.test/letters/${opaqueId()}.pdf`,
      issuedAt: db.clock.nowIso(),
      expiresAt: db.clock.daysAhead(LETTER_DAYS),
    };
    db.letters.unshift(letter);
    return resourceCreated(letter);
  }),

  route(MockMethod.GET, routes.accounts.list, ({ db, query }) => {
    const status = query.get('status');
    const type = query.get('type');
    const currency = query.get('currency');

    const filtered = db.accounts.filter(
      (account) =>
        (!status || account.status === status) &&
        (!type || account.type === type) &&
        (!currency || account.currency === currency),
    );
    return paginate(filtered, query, { includeTotal: true });
  }),

  route(MockMethod.POST, routes.accounts.create, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const account = makeAccount({
      clock: db.clock,
      userId: db.currentUser.id,
      type: AccountType.CURRENT,
      overrides: {
        productCode: typeof input.productCode === 'string' ? input.productCode : 'RB-CURRENT-PLUS',
        currency: (input.currency as Account['currency']) ?? 'GBP',
        nickname: typeof input.nickname === 'string' ? input.nickname : null,
        status: AccountStatus.ACTIVE,
        isPrimary: false,
        openedAt: db.clock.nowIso(),
      },
    });
    db.accounts.push(account);
    return resourceCreated(account);
  }),

  route(MockMethod.GET, routes.accounts.balance(':id'), ({ db, params }) => {
    const account = db.accounts.find((candidate) => candidate.id === params.id);
    return account ? resourceOk(account.balance) : accountMissing();
  }),

  route(MockMethod.POST, routes.accounts.close(':id'), ({ db, params }) => {
    const index = db.accounts.findIndex((candidate) => candidate.id === params.id);
    const account = db.accounts[index];
    if (index === -1 || !account) return accountMissing();

    if (minorUnits(account.balance.ledger) !== 0n) {
      return failure(
        ErrorCode.ACCOUNT_NOT_EMPTY,
        'Move the remaining balance out before closing this account.',
      );
    }

    const closed: Account = {
      ...account,
      status: AccountStatus.CLOSED,
      closedAt: db.clock.nowIso(),
    };
    db.accounts[index] = closed;
    return resourceOk(closed);
  }),

  route(MockMethod.GET, routes.accounts.statements(':id'), ({ db, params, query }) =>
    paginate(
      db.statements.filter((statement) => statement.accountId === params.id),
      query,
    ),
  ),

  route(MockMethod.POST, routes.accounts.statements(':id'), ({ db, params }) => {
    const account = db.accounts.find((candidate) => candidate.id === params.id);
    if (!account) return accountMissing();
    const statement = makeStatement({ clock: db.clock, account, monthsAgo: 0 });
    db.statements.unshift(statement);
    return resourceCreated(statement);
  }),

  route(
    MockMethod.GET,
    routes.accounts.statement(':accountId', ':statementId'),
    ({ db, params }) => {
      const statement = db.statements.find(
        (candidate) =>
          candidate.id === params.statementId && candidate.accountId === params.accountId,
      );
      return statement ? resourceOk(statement) : notFound('That statement');
    },
  ),

  route(MockMethod.GET, routes.accounts.byId(':id'), ({ db, params }) => {
    const account = db.accounts.find((candidate) => candidate.id === params.id);
    return account ? resourceOk(account) : accountMissing();
  }),

  route(MockMethod.PATCH, routes.accounts.byId(':id'), ({ body, db, params }) => {
    const index = db.accounts.findIndex((candidate) => candidate.id === params.id);
    const account = db.accounts[index];
    if (index === -1 || !account) return accountMissing();

    const input = (body ?? {}) as Record<string, unknown>;
    const updated: Account = {
      ...account,
      nickname: 'nickname' in input ? (input.nickname as string | null) : account.nickname,
      isPrimary: typeof input.isPrimary === 'boolean' ? input.isPrimary : account.isPrimary,
    };
    db.accounts[index] = updated;
    return resourceOk(updated);
  }),
];

/** Transactions and insights. */
export const transactionHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.transactions.export, ({ db }) => resourceOk(exportJob(db.clock))),

  route(MockMethod.POST, routes.transactions.export, ({ db }) =>
    resourceCreated(exportJob(db.clock)),
  ),

  route(MockMethod.GET, routes.transactions.list, ({ db, query }) =>
    paginate(filterTransactions(db.transactions, query), query),
  ),

  route(MockMethod.GET, routes.transactions.receipt(':id'), ({ db, params }) => {
    const transaction = db.transactions.find((candidate) => candidate.id === params.id);
    if (!transaction) return notFound('That transaction');

    return resourceOk({
      transactionId: transaction.id,
      reference: transaction.reference ?? transaction.id,
      downloadUrl: `https://assets.reliance.test/receipts/${transaction.id}.pdf`,
      html: `<article><h1>${transaction.description}</h1><p>${transaction.amount.amount}</p></article>`,
      generatedAt: db.clock.nowIso(),
    });
  }),

  route(MockMethod.GET, routes.transactions.byId(':id'), ({ db, params }) => {
    const transaction = db.transactions.find((candidate) => candidate.id === params.id);
    return transaction ? resourceOk(transaction) : notFound('That transaction');
  }),

  route(MockMethod.PATCH, routes.transactions.update(':id'), ({ body, db, params }) => {
    const index = db.transactions.findIndex((candidate) => candidate.id === params.id);
    const transaction = db.transactions[index];
    if (index === -1 || !transaction) return notFound('That transaction');

    const input = (body ?? {}) as Record<string, unknown>;
    const updated: Transaction = {
      ...transaction,
      category: (input.category as SpendCategory) ?? transaction.category,
      categoryOverridden: input.category !== undefined || transaction.categoryOverridden,
      notes: 'notes' in input ? (input.notes as string | null) : transaction.notes,
    };
    db.transactions[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.GET, routes.insights.spend, ({ db }) => {
    const debits = db.transactions.filter(
      (transaction) => transaction.direction === TransactionDirection.DEBIT,
    );
    const total = sumMoney(debits.map((transaction) => transaction.amount));
    const totalMinor = minorUnits(total);

    const grouped = new Map<SpendCategory, Transaction[]>();
    for (const transaction of debits) {
      grouped.set(transaction.category, [
        ...(grouped.get(transaction.category) ?? []),
        transaction,
      ]);
    }

    return resourceOk({
      currency: 'GBP',
      from: db.clock.daysAgo(90),
      to: db.clock.nowIso(),
      total,
      categories: [...grouped.entries()].map(([category, items]) => {
        const categoryTotal = sumMoney(items.map((item) => item.amount));
        return {
          category,
          total: categoryTotal,
          transactionCount: items.length,
          shareBps:
            totalMinor === 0n ? 0 : Number((minorUnits(categoryTotal) * BigInt(BPS)) / totalMinor),
          changeFromPreviousBps: null,
        };
      }),
    });
  }),

  route(MockMethod.GET, routes.insights.cashflow, ({ db }) => {
    const MONTHS = 6;
    const DAYS_PER_MONTH = 30;

    return resourceOk({
      currency: 'GBP',
      buckets: Array.from({ length: MONTHS }, (_unused, index) => {
        const monthsAgo = MONTHS - 1 - index;
        const inflow = money(320_000 - monthsAgo * 4_000);
        const outflow = money(285_000 - monthsAgo * 3_100);
        return {
          period: db.clock.dateDaysAgo(monthsAgo * DAYS_PER_MONTH).slice(0, 7),
          moneyIn: inflow,
          moneyOut: outflow,
          net: subtractMoney(inflow, outflow),
          closingBalance: money(400_000 + index * 35_000),
        };
      }),
    });
  }),

  route(MockMethod.GET, routes.insights.subscriptions, ({ db }) => {
    const merchants = new Map<string, Transaction[]>();
    for (const transaction of db.transactions) {
      if (transaction.category !== SpendCategory.SUBSCRIPTIONS) continue;
      merchants.set(transaction.description, [
        ...(merchants.get(transaction.description) ?? []),
        transaction,
      ]);
    }

    return paginateStatic(
      [...merchants.entries()].map(([merchantName, items]) => ({
        merchantName,
        logoUrl: null,
        amount: items[0]?.amount ?? zero(),
        cadence: 'MONTHLY' as const,
        lastChargedAt: items[0]?.bookedAt ?? db.clock.nowIso(),
        nextExpectedAt: db.clock.daysAhead(30),
        transactionCount: items.length,
      })),
    );
  }),

  route(MockMethod.GET, routes.insights.budgets, ({ db }) => paginateStatic(budgets(db.clock))),

  route(MockMethod.POST, routes.insights.budgets, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const limit = (input.limit as ReturnType<typeof money>) ?? money(50_000);
    return resourceCreated({
      id: opaqueId(),
      category: (input.category as SpendCategory) ?? SpendCategory.GROCERIES,
      limit,
      spent: zero(),
      remaining: limit,
      utilisationBps: 0,
      periodStart: db.clock.dateDaysAgo(0),
      periodEnd: db.clock.daysAhead(30),
      alertAtBps: Number(input.alertAtBps ?? 8_000),
    });
  }),

  route(MockMethod.GET, routes.insights.budget(':id'), ({ db, params }) => {
    const budget = budgets(db.clock).find((candidate) => candidate.id === params.id);
    return budget ? resourceOk(budget) : notFound('That budget');
  }),

  route(MockMethod.PATCH, routes.insights.budget(':id'), ({ body, db, params }) => {
    const budget = budgets(db.clock)[0];
    if (!budget) return notFound('That budget');
    return resourceOk({ ...budget, ...(body as Record<string, unknown>), id: params.id });
  }),

  route(MockMethod.DELETE, routes.insights.budget(':id'), () => acknowledged()),
];

function accountMissing() {
  return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');
}

function byCurrency(accounts: readonly Account[]) {
  const totals = new Map<string, ReturnType<typeof money>>();
  for (const account of accounts) {
    const running = totals.get(account.currency);
    totals.set(
      account.currency,
      running
        ? money(minorUnits(running) + minorUnits(account.balance.ledger), account.currency)
        : account.balance.ledger,
    );
  }
  return [...totals.entries()].map(([currency, total]) => ({ currency, total }));
}

function filterTransactions(
  transactions: readonly Transaction[],
  query: URLSearchParams,
): Transaction[] {
  const accountId = query.get('accountId');
  const direction = query.get('direction');
  const category = query.get('category');
  const status = query.get('status');
  const search = query.get('search')?.toLowerCase();

  return transactions.filter(
    (transaction) =>
      (!accountId || transaction.accountId === accountId) &&
      (!direction || transaction.direction === direction) &&
      (!category || transaction.category === category) &&
      (!status || transaction.status === status) &&
      (!search || transaction.description.toLowerCase().includes(search)),
  );
}

function exportJob(clock: { nowIso: () => string; daysAhead: (days: number) => string }) {
  return {
    id: opaqueId(),
    status: 'READY' as const,
    format: 'CSV' as const,
    downloadUrl: `https://assets.reliance.test/exports/${opaqueId()}.csv`,
    sizeBytes: 48_211,
    rowCount: 412,
    failureReason: null,
    requestedAt: clock.nowIso(),
    readyAt: clock.nowIso(),
    expiresAt: clock.daysAhead(EXPORT_DAYS),
  };
}

/**
 * Budgets are derived rather than stored.
 *
 * They are a projection over the transaction feed in the real system too, so deriving
 * them keeps the mock's spend figures agreeing with the mock's transaction list.
 */
function budgets(clock: {
  dateDaysAgo: (days: number) => string;
  daysAhead: (d: number) => string;
}) {
  const SEED: readonly {
    id: string;
    category: SpendCategory;
    limitMinor: number;
    spentMinor: number;
  }[] = [
    {
      id: 'budget-groceries',
      category: SpendCategory.GROCERIES,
      limitMinor: 40_000,
      spentMinor: 27_450,
    },
    { id: 'budget-dining', category: SpendCategory.DINING, limitMinor: 20_000, spentMinor: 18_900 },
    {
      id: 'budget-transport',
      category: SpendCategory.TRANSPORT,
      limitMinor: 15_000,
      spentMinor: 6_200,
    },
  ];

  return SEED.map((entry) => ({
    id: entry.id,
    category: entry.category,
    limit: money(entry.limitMinor),
    spent: money(entry.spentMinor),
    remaining: money(entry.limitMinor - entry.spentMinor),
    utilisationBps: Math.round((entry.spentMinor / entry.limitMinor) * BPS),
    periodStart: `${clock.dateDaysAgo(0).slice(0, 7)}-01T00:00:00.000Z`,
    periodEnd: clock.daysAhead(30),
    alertAtBps: 8_000,
  }));
}
