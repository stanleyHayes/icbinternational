/**
 * Transfer, payee, standing-order and bulk handlers.
 *
 * Creating a transfer here does four things: debits the source account, appends a
 * transaction, records the transfer, and raises a notification. That is the whole point
 * of this package — a UI lane can build the "money left my account" flow end to end and
 * see the balance actually move.
 */

import {
  EntryType,
  ErrorCode,
  IDEMPOTENCY_HEADER,
  NameCheckResult,
  NotificationCategory,
  routes,
  TransactionDirection,
  TransferOrderStatus,
  TransferRail,
  TransferStatus,
  type Account,
  type Beneficiary,
  type Transfer,
  type TransferDestination,
} from '@reliance/contracts';

import { findAccount, hasInsufficientFunds, notify, postToAccount } from '../db/ledger.js';
import { addMoney, minorUnits, money, zero } from '../db/money.js';
import type { MockDatabase, MockTransferQuote } from '../db/types.js';
import { makeBeneficiary } from '../factories/movement.js';
import { mockId, opaqueId } from '../faker.js';

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
import { paginate } from './paging.js';
import { readMoney } from './read-body.js';

const QUOTE_VALIDITY_MINUTES = 10;
const INTERNATIONAL_FEE_MINOR = 750;
const ARRIVAL_MINUTES = 120;

function readDestination(body: unknown): TransferDestination | null {
  if (typeof body !== 'object' || body === null) return null;
  const destination = (body as { destination?: unknown }).destination;
  if (typeof destination !== 'object' || destination === null) return null;
  return destination as TransferDestination;
}

/** Transfers. */
export const transferHandlers: readonly MockRoute[] = [
  route(MockMethod.POST, routes.transfers.quote, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const sourceAccountId = typeof input.sourceAccountId === 'string' ? input.sourceAccountId : '';
    const account = findAccount(db, sourceAccountId);
    if (!account) return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');

    const destination = readDestination(body);
    const amount = readMoney(body, 'amount') ?? money(0, account.currency);
    const isInternational = destination?.kind === 'INTERNATIONAL';
    const fee = isInternational
      ? money(INTERNATIONAL_FEE_MINOR, account.currency)
      : zero(account.currency);
    const id = mockId('qte');

    if (destination) {
      db.transferQuotes[id] = {
        destination,
        debit: addMoney(amount, fee),
        fee,
        sourceAccountId,
        expiresAt: db.clock.minutesAhead(QUOTE_VALIDITY_MINUTES),
      };
    }

    return resourceOk({
      id,
      rail: railFor(destination),
      debitAmount: addMoney(amount, fee),
      creditAmount: amount,
      fee,
      exchangeRate: null,
      rateExpiresAt: null,
      estimatedArrival: db.clock.minutesAhead(ARRIVAL_MINUTES),
      cutOffAt: null,
      requiresStepUp: minorUnits(amount) > 100_000n,
      warnings: isInternational ? ['Correspondent bank charges may apply.'] : [],
      expiresAt: db.clock.minutesAhead(QUOTE_VALIDITY_MINUTES),
    });
  }),

  route(MockMethod.GET, routes.transfers.list, ({ db, query }) => {
    const status = query.get('status');
    const rail = query.get('rail');
    const sourceAccountId = query.get('sourceAccountId');

    return paginate(
      db.transfers.filter(
        (transfer) =>
          (!status || transfer.status === status) &&
          (!rail || transfer.rail === rail) &&
          (!sourceAccountId || transfer.sourceAccountId === sourceAccountId),
      ),
      query,
    );
  }),

  route(MockMethod.POST, routes.transfers.create, ({ body, db, headers }) => {
    const rejection = rejectExecution({ body, db, headers });
    if (rejection) return rejection;

    const quoteId = readString(body, 'quoteId') ?? '';
    const quote = db.transferQuotes[quoteId];
    const account = quote ? findAccount(db, quote.sourceAccountId) : undefined;
    if (!quote || !account) {
      return failure(ErrorCode.QUOTE_NOT_FOUND, 'That quote has expired. Please price it again.');
    }

    const transfer = executeTransfer(db, quote, account, readString(body, 'reference'));
    delete db.transferQuotes[quoteId];

    notify(db, {
      category: NotificationCategory.TRANSACTION,
      title: 'Payment sent',
      body: `Your payment to ${destinationName(quote.destination)} is on its way.`,
    });

    return resourceCreated(transfer);
  }),

  route(MockMethod.POST, routes.transfers.cancel(':id'), ({ db, params }) => {
    const index = db.transfers.findIndex((transfer) => transfer.id === params.id);
    const transfer = db.transfers[index];
    if (index === -1 || !transfer) return notFound('That transfer');

    const CANCELLABLE: readonly TransferStatus[] = [
      TransferStatus.DRAFT,
      TransferStatus.SCHEDULED,
      TransferStatus.AWAITING_APPROVAL,
      TransferStatus.PENDING,
    ];
    if (!CANCELLABLE.includes(transfer.status)) {
      return failure(
        ErrorCode.TRANSFER_NOT_CANCELLABLE,
        'This payment has already left the bank and cannot be cancelled.',
      );
    }

    const cancelled: Transfer = {
      ...transfer,
      status: TransferStatus.CANCELLED,
      timeline: [
        ...transfer.timeline,
        { status: TransferStatus.CANCELLED, at: db.clock.nowIso(), detail: 'Cancelled by you' },
      ],
    };
    db.transfers[index] = cancelled;
    return resourceOk(cancelled);
  }),

  route(MockMethod.GET, routes.transfers.byId(':id'), ({ db, params }) => {
    const transfer = db.transfers.find((candidate) => candidate.id === params.id);
    return transfer ? resourceOk(transfer) : notFound('That transfer');
  }),
];

/** Beneficiaries. */
export const beneficiaryHandlers: readonly MockRoute[] = [
  route(MockMethod.POST, routes.beneficiaries.verifyName, ({ body }) => {
    const expected =
      typeof body === 'object' && body !== null
        ? (body as { expectedName?: unknown }).expectedName
        : '';
    const name = typeof expected === 'string' ? expected : '';

    // A deterministic switch so a lane can reach the close-match warning on demand.
    const result = name.toLowerCase().includes('close')
      ? NameCheckResult.CLOSE_MATCH
      : NameCheckResult.MATCH;

    return resourceOk({
      result,
      suggestion: result === NameCheckResult.CLOSE_MATCH ? `${name.split(' ')[0]} Smith` : null,
      message:
        result === NameCheckResult.MATCH
          ? 'The name matches the account.'
          : 'The name is close but not an exact match. Check before you send.',
    });
  }),

  route(MockMethod.GET, routes.beneficiaries.list, ({ db, query }) => {
    const favouritesOnly = query.get('favouritesOnly') === 'true';
    const search = query.get('search')?.toLowerCase();

    return paginate(
      db.beneficiaries.filter(
        (beneficiary) =>
          (!favouritesOnly || beneficiary.isFavourite) &&
          (!search || beneficiary.nickname.toLowerCase().includes(search)),
      ),
      query,
    );
  }),

  route(MockMethod.POST, routes.beneficiaries.create, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const destination = readDestination(body);
    const beneficiary = makeBeneficiary({
      clock: db.clock,
      overrides: {
        nickname: typeof input.nickname === 'string' ? input.nickname : 'New payee',
        isFavourite: input.isFavourite === true,
        createdAt: db.clock.nowIso(),
        // New payees are held for a cooling-off window before large payments are allowed.
        trustedFrom: db.clock.daysAhead(1),
        lastUsedAt: null,
        ...(destination ? { destination } : {}),
      },
    });
    db.beneficiaries.unshift(beneficiary);
    return resourceCreated(beneficiary);
  }),

  route(MockMethod.GET, routes.beneficiaries.byId(':id'), ({ db, params }) => {
    const beneficiary = db.beneficiaries.find((candidate) => candidate.id === params.id);
    return beneficiary ? resourceOk(beneficiary) : beneficiaryMissing();
  }),

  route(MockMethod.PATCH, routes.beneficiaries.byId(':id'), ({ body, db, params }) => {
    const index = db.beneficiaries.findIndex((candidate) => candidate.id === params.id);
    const existing = db.beneficiaries[index];
    if (index === -1 || !existing) return beneficiaryMissing();

    const updated: Beneficiary = { ...existing, ...(body as Partial<Beneficiary>) };
    db.beneficiaries[index] = updated;
    return resourceOk(updated);
  }),

  route(MockMethod.DELETE, routes.beneficiaries.byId(':id'), ({ db, params }) => {
    const remaining = db.beneficiaries.filter((candidate) => candidate.id !== params.id);
    if (remaining.length === db.beneficiaries.length) return beneficiaryMissing();
    db.beneficiaries = remaining;
    return acknowledged();
  }),
];

/** Standing orders and bulk files. */
export const transferOrderHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.transferOrders.list, ({ db, query }) =>
    paginate(db.transferOrders, query),
  ),

  route(MockMethod.POST, routes.transferOrders.create, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const order = {
      ...(db.transferOrders[0] ?? {}),
      id: mockId('tro'),
      name: typeof input.name === 'string' ? input.name : 'New standing order',
      status: TransferOrderStatus.ACTIVE,
      sourceAccountId: String(input.sourceAccountId ?? ''),
      beneficiaryId: String(input.beneficiaryId ?? ''),
      amount: readMoney(body, 'amount') ?? money(0),
      occurrencesRun: 0,
      consecutiveFailures: 0,
      createdAt: db.clock.nowIso(),
      nextRunAt: db.clock.daysAhead(30),
      lastRunAt: null,
    } as (typeof db.transferOrders)[number];

    db.transferOrders.unshift(order);
    return resourceCreated(order);
  }),

  route(MockMethod.POST, routes.transferOrders.skip(':id'), ({ db, params }) =>
    mutateOrder(db.transferOrders, params.id, (order) => ({
      ...order,
      nextRunAt: db.clock.daysAhead(60),
    })),
  ),

  route(MockMethod.POST, routes.transferOrders.pause(':id'), ({ body, db, params }) => {
    const paused =
      typeof body === 'object' && body !== null
        ? (body as { paused?: unknown }).paused !== false
        : true;
    return mutateOrder(db.transferOrders, params.id, (order) => ({
      ...order,
      status: paused ? TransferOrderStatus.PAUSED : TransferOrderStatus.ACTIVE,
    }));
  }),

  route(MockMethod.GET, routes.transferOrders.byId(':id'), ({ db, params }) => {
    const order = db.transferOrders.find((candidate) => candidate.id === params.id);
    return order ? resourceOk(order) : notFound('That standing order');
  }),

  route(MockMethod.PATCH, routes.transferOrders.byId(':id'), ({ body, db, params }) =>
    mutateOrder(db.transferOrders, params.id, (order) => ({
      ...order,
      ...(body as Record<string, unknown>),
    })),
  ),

  route(MockMethod.DELETE, routes.transferOrders.byId(':id'), ({ db, params }) => {
    const remaining = db.transferOrders.filter((candidate) => candidate.id !== params.id);
    if (remaining.length === db.transferOrders.length) return notFound('That standing order');
    db.transferOrders = remaining;
    return acknowledged();
  }),

  route(MockMethod.POST, routes.bulkTransfers.create, ({ db }) => {
    const batch = db.bulkTransfers[0];
    if (!batch) return notFound('A bulk transfer template');
    const created = { ...batch, id: opaqueId(), createdAt: db.clock.nowIso() };
    db.bulkTransfers.unshift(created);
    return resourceCreated(created);
  }),

  route(MockMethod.POST, routes.bulkTransfers.approve(':id'), ({ db, params }) => {
    const index = db.bulkTransfers.findIndex((candidate) => candidate.id === params.id);
    const batch = db.bulkTransfers[index];
    if (index === -1 || !batch) return notFound('That batch');

    const approved = {
      ...batch,
      status: 'COMPLETED' as const,
      rows: batch.rows.map((row) => ({ ...row, status: 'SETTLED' as const })),
      completedAt: db.clock.nowIso(),
    };
    db.bulkTransfers[index] = approved;
    return resourceOk(approved);
  }),

  route(MockMethod.GET, routes.bulkTransfers.byId(':id'), ({ db, params }) => {
    const batch = db.bulkTransfers.find((candidate) => candidate.id === params.id);
    return batch ? resourceOk(batch) : notFound('That batch');
  }),
];

/** Reads a string field off an untyped body. */
function readString(body: unknown, key: string): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

interface ExecutionInput {
  readonly body: unknown;
  readonly db: MockDatabase;
  readonly headers: Headers;
}

/**
 * The reasons the mock refuses to execute a quoted transfer.
 *
 * Pulled out of the handler so each guard reads as one sentence, and so the handler
 * itself is a sequence of steps rather than a wall of early returns.
 */
function rejectExecution({ body, db, headers }: ExecutionInput) {
  if (!headers.get(IDEMPOTENCY_HEADER)) {
    return failure(
      ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
      'This endpoint requires an Idempotency-Key header.',
    );
  }

  const quote = db.transferQuotes[readString(body, 'quoteId') ?? ''];
  if (!quote) {
    return failure(ErrorCode.QUOTE_NOT_FOUND, 'That quote has expired. Please price it again.');
  }

  const account = findAccount(db, quote.sourceAccountId);
  if (!account) return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');

  return hasInsufficientFunds(account, quote.debit)
    ? failure(
        ErrorCode.INSUFFICIENT_FUNDS,
        'There is not enough available balance for this payment.',
      )
    : null;
}

/** Debits the account, records the transaction, and builds the transfer. */
function executeTransfer(
  db: MockDatabase,
  quote: MockTransferQuote,
  account: Account,
  reference: string | null,
): Transfer {
  const payee = destinationName(quote.destination);

  const transaction = postToAccount(db, {
    accountId: account.id,
    amount: quote.debit,
    direction: TransactionDirection.DEBIT,
    type: EntryType.DOMESTIC_TRANSFER,
    description: payee,
    reference,
    counterpartyName: payee,
  });

  const now = db.clock.nowIso();
  const transfer: Transfer = {
    id: mockId('trf'),
    rail: railFor(quote.destination),
    status: TransferStatus.SETTLED,
    sourceAccountId: account.id,
    destination: quote.destination,
    debitAmount: quote.debit,
    creditAmount: money(minorUnits(quote.debit) - minorUnits(quote.fee), account.currency),
    fee: quote.fee,
    exchangeRate: null,
    reference,
    railReference: opaqueId().toUpperCase(),
    returnCode: null,
    returnReason: null,
    journalEntryId: transaction?.journalEntryId ?? null,
    timeline: [
      { status: TransferStatus.PENDING, at: now, detail: 'Payment created' },
      { status: TransferStatus.SUBMITTED, at: now, detail: 'Sent to clearing' },
      { status: TransferStatus.SETTLED, at: now, detail: 'Funds delivered' },
    ],
    estimatedArrival: now,
    createdAt: now,
    settledAt: now,
  };

  db.transfers.unshift(transfer);
  return transfer;
}

function beneficiaryMissing() {
  return failure(ErrorCode.BENEFICIARY_NOT_FOUND, 'That payee was not found.');
}

function mutateOrder<T extends { id: string }>(
  collection: T[],
  id: string | undefined,
  change: (order: T) => T,
) {
  const index = collection.findIndex((candidate) => candidate.id === id);
  const existing = collection[index];
  if (index === -1 || !existing) return notFound('That standing order');
  const updated = change(existing);
  collection[index] = updated;
  return resourceOk(updated);
}

function railFor(destination: TransferDestination | null): TransferRail {
  if (destination?.kind === 'INTERNAL') return TransferRail.INTERNAL;
  if (destination?.kind === 'INTERNATIONAL') return TransferRail.INTERNATIONAL_SWIFT;
  return TransferRail.DOMESTIC_ACH;
}

function destinationName(destination: TransferDestination): string {
  if (destination.kind === 'INTERNAL')
    return destination.handle ?? destination.email ?? 'Internal transfer';
  return destination.accountName;
}
