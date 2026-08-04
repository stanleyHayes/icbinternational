/**
 * Bill payment, top-up, payment-request and mandate handlers.
 */

import {
  BillPaymentStatus,
  EntryType,
  ErrorCode,
  MandateStatus,
  NotificationCategory,
  PaymentRequestStatus,
  routes,
  TransactionDirection,
  type BillPayment,
  type PaymentRequest,
} from '@reliance/contracts';

import { findAccount, hasInsufficientFunds, notify, postToAccount } from '../db/ledger.js';
import { money, sumMoney, zero } from '../db/money.js';
import { opaqueId } from '../faker.js';

import {
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

const DEFAULT_REQUEST_HOURS = 72;
const HOURS_PER_DAY = 24;

/** Billers, bill payments, top-ups, requests and mandates. */
export const paymentHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.payments.billers, ({ db, query }) => {
    const category = query.get('category');
    const search = query.get('search')?.toLowerCase();
    return paginate(
      db.billers.filter(
        (biller) =>
          (!category || biller.category === category) &&
          (!search || biller.name.toLowerCase().includes(search)),
      ),
      query,
      { includeTotal: true },
    );
  }),

  route(MockMethod.GET, routes.payments.biller(':id'), ({ db, params }) => {
    const biller = db.billers.find((candidate) => candidate.id === params.id);
    return biller ? resourceOk(biller) : notFound('That biller');
  }),

  route(MockMethod.GET, routes.payments.billPayments, ({ db, query }) =>
    paginate(db.billPayments, query),
  ),

  route(MockMethod.POST, routes.payments.billPayments, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const biller = db.billers.find((candidate) => candidate.id === input.billerId);
    if (!biller) return notFound('That biller');

    const account = findAccount(db, String(input.sourceAccountId ?? ''));
    if (!account) return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');

    const amount = readMoney(body, 'amount') ?? zero(account.currency);
    const total = sumMoney([amount, biller.fee], account.currency);
    if (hasInsufficientFunds(account, total)) {
      return failure(ErrorCode.INSUFFICIENT_FUNDS, 'There is not enough to cover this bill.');
    }

    const transaction = postToAccount(db, {
      accountId: account.id,
      amount: total,
      direction: TransactionDirection.DEBIT,
      type: EntryType.BILL_PAYMENT,
      description: biller.name,
      counterpartyName: biller.name,
    });

    const payment: BillPayment = {
      id: opaqueId(),
      billerId: biller.id,
      billerName: biller.name,
      status: BillPaymentStatus.COMPLETED,
      sourceAccountId: account.id,
      customerReference: String(input.customerReference ?? ''),
      amount,
      fee: biller.fee,
      billerReceipt: opaqueId().toUpperCase(),
      failureReason: null,
      transactionId: transaction?.id ?? null,
      createdAt: db.clock.nowIso(),
      completedAt: db.clock.nowIso(),
    };

    db.billPayments.unshift(payment);
    notify(db, {
      category: NotificationCategory.TRANSACTION,
      title: 'Bill paid',
      body: `Your payment to ${biller.name} has gone through.`,
    });
    return resourceCreated(payment);
  }),

  route(MockMethod.GET, routes.payments.billPayment(':id'), ({ db, params }) => {
    const payment = db.billPayments.find((candidate) => candidate.id === params.id);
    return payment ? resourceOk(payment) : notFound('That bill payment');
  }),

  route(MockMethod.POST, routes.payments.topUps, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const account = findAccount(db, String(input.sourceAccountId ?? ''));
    if (!account) return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');

    const amount = readMoney(body, 'amount') ?? zero(account.currency);
    if (hasInsufficientFunds(account, amount)) {
      return failure(ErrorCode.INSUFFICIENT_FUNDS, 'There is not enough for this top-up.');
    }

    const provider = String(input.provider ?? 'Mobile top-up');
    const transaction = postToAccount(db, {
      accountId: account.id,
      amount,
      direction: TransactionDirection.DEBIT,
      type: EntryType.BILL_PAYMENT,
      description: provider,
      counterpartyName: provider,
    });

    const payment: BillPayment = {
      id: opaqueId(),
      billerId: opaqueId(),
      billerName: provider,
      status: BillPaymentStatus.COMPLETED,
      sourceAccountId: account.id,
      customerReference: String(input.phone ?? ''),
      amount,
      fee: zero(account.currency),
      billerReceipt: opaqueId().toUpperCase(),
      failureReason: null,
      transactionId: transaction?.id ?? null,
      createdAt: db.clock.nowIso(),
      completedAt: db.clock.nowIso(),
    };

    db.billPayments.unshift(payment);
    return resourceCreated(payment);
  }),

  route(MockMethod.POST, routes.payments.splitBill, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const participants = Array.isArray(input.participants) ? input.participants : [];
    const total = readMoney(body, 'totalAmount') ?? zero();
    const shareMinor =
      participants.length === 0 ? 0n : BigInt(total.amount) / BigInt(participants.length);

    const created = participants.map((participant) => {
      const name =
        typeof participant === 'object' && participant !== null
          ? String((participant as { name?: unknown }).name ?? 'Someone')
          : 'Someone';
      const token = opaqueId();

      const request: PaymentRequest = {
        id: token,
        status: PaymentRequestStatus.OPEN,
        requesterName: `${db.currentUser.firstName} ${db.currentUser.lastName}`,
        amount: money(shareMinor, total.currency),
        note: typeof input.note === 'string' ? input.note : null,
        shareUrl: `https://pay.reliance.test/r/${token}`,
        qrPayload: `reliance://pay/${token}`,
        destinationAccountId: String(input.destinationAccountId ?? ''),
        paidByName: name,
        expiresAt: db.clock.daysAhead(3),
        createdAt: db.clock.nowIso(),
        paidAt: null,
      };
      db.paymentRequests.unshift(request);
      return request;
    });

    return {
      status: 201,
      body: { data: created, page: { cursor: null, limit: created.length, hasMore: false } },
    };
  }),

  route(MockMethod.GET, routes.payments.requests, ({ db, query }) =>
    paginate(db.paymentRequests, query),
  ),

  route(MockMethod.POST, routes.payments.requests, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const hours = Number(input.expiresInHours ?? DEFAULT_REQUEST_HOURS);
    const token = opaqueId();

    const request: PaymentRequest = {
      id: token,
      status: PaymentRequestStatus.OPEN,
      requesterName: `${db.currentUser.firstName} ${db.currentUser.lastName}`,
      amount: readMoney(body, 'amount') ?? zero(),
      note: typeof input.note === 'string' ? input.note : null,
      shareUrl: `https://pay.reliance.test/r/${token}`,
      qrPayload: `reliance://pay/${token}`,
      destinationAccountId: String(input.destinationAccountId ?? ''),
      paidByName: null,
      expiresAt: db.clock.daysAhead(hours / HOURS_PER_DAY),
      createdAt: db.clock.nowIso(),
      paidAt: null,
    };

    db.paymentRequests.unshift(request);
    return resourceCreated(request);
  }),

  route(MockMethod.POST, routes.payments.payRequest(':id'), ({ body, db, params }) => {
    const index = db.paymentRequests.findIndex((candidate) => candidate.id === params.id);
    const request = db.paymentRequests[index];
    if (index === -1 || !request) return notFound('That payment request');

    if (request.status !== PaymentRequestStatus.OPEN) {
      return failure(
        ErrorCode.PAYMENT_REQUEST_EXPIRED,
        'This request has already been settled or has expired.',
      );
    }

    const input = (body ?? {}) as Record<string, unknown>;
    const account = findAccount(db, String(input.sourceAccountId ?? ''));
    if (!account) return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');
    if (hasInsufficientFunds(account, request.amount)) {
      return failure(ErrorCode.INSUFFICIENT_FUNDS, 'There is not enough to settle this request.');
    }

    postToAccount(db, {
      accountId: account.id,
      amount: request.amount,
      direction: TransactionDirection.DEBIT,
      type: EntryType.INTERNAL_TRANSFER,
      description: request.requesterName,
      counterpartyName: request.requesterName,
    });

    const paid: PaymentRequest = {
      ...request,
      status: PaymentRequestStatus.PAID,
      paidByName: `${db.currentUser.firstName} ${db.currentUser.lastName}`,
      paidAt: db.clock.nowIso(),
    };
    db.paymentRequests[index] = paid;
    return resourceOk(paid);
  }),

  route(MockMethod.GET, routes.payments.request(':id'), ({ db, params }) => {
    const request = db.paymentRequests.find((candidate) => candidate.id === params.id);
    return request ? resourceOk(request) : notFound('That payment request');
  }),

  route(MockMethod.DELETE, routes.payments.request(':id'), ({ db, params }) => {
    const index = db.paymentRequests.findIndex((candidate) => candidate.id === params.id);
    const request = db.paymentRequests[index];
    if (index === -1 || !request) return notFound('That payment request');

    const cancelled: PaymentRequest = { ...request, status: PaymentRequestStatus.CANCELLED };
    db.paymentRequests[index] = cancelled;
    return resourceOk(cancelled);
  }),

  route(MockMethod.GET, routes.payments.mandates, ({ db, query }) => {
    const status = query.get('status');
    const accountId = query.get('accountId');
    return paginate(
      db.mandates.filter(
        (mandate) =>
          (!status || mandate.status === status) && (!accountId || mandate.accountId === accountId),
      ),
      query,
    );
  }),

  route(MockMethod.GET, routes.payments.mandate(':id'), ({ db, params }) => {
    const mandate = db.mandates.find((candidate) => candidate.id === params.id);
    return mandate ? resourceOk(mandate) : notFound('That mandate');
  }),

  route(MockMethod.PATCH, routes.payments.mandate(':id'), ({ body, db, params }) => {
    const index = db.mandates.findIndex((candidate) => candidate.id === params.id);
    const mandate = db.mandates[index];
    if (index === -1 || !mandate) return notFound('That mandate');

    if (mandate.status === MandateStatus.CANCELLED) {
      return failure(
        ErrorCode.MANDATE_CANCELLED,
        'This mandate is cancelled. The merchant must ask for a new one.',
      );
    }

    const input = (body ?? {}) as Record<string, unknown>;
    const status = (input.status as MandateStatus) ?? mandate.status;
    const updated = {
      ...mandate,
      status,
      cancelledAt: status === MandateStatus.CANCELLED ? db.clock.nowIso() : mandate.cancelledAt,
    };
    db.mandates[index] = updated;
    return resourceOk(updated);
  }),
];
