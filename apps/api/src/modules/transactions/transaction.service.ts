import { Injectable } from '@nestjs/common';

import {
  type ListTransactionsQuery,
  type Paginated,
  type Transaction,
  type UpdateTransactionRequest,
} from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import {
  TransactionStore,
  type TransactionListQuery,
  type TransactionRecord,
} from './repositories/transaction.store.js';
import { toTransactionResponse } from './transaction.presenter.js';

/** Identifies one row and the customer claiming it. */
export interface OwnedTransactionRef {
  readonly userId: string;
  readonly transactionId: string;
}

/**
 * Reads and customer edits of the transaction feed.
 *
 * Everything here is scoped to one customer, and the scoping lives in the query rather
 * than in a check performed around it. A row belonging to someone else does not fail an
 * authorisation test — it simply never matches, so there is no code path, present or
 * future, that can leak one customer's feed into another's session by forgetting a guard.
 *
 * Nothing in this service writes a money-bearing field. Amounts, balances and statuses
 * come from the projector, which is the only writer of them; a customer may change how a
 * movement is *labelled*, never what it was.
 */
@Injectable()
export class TransactionService {
  constructor(private readonly transactions: TransactionStore) {}

  /** A page of the customer's feed under the contract's full filter set. */
  async list(userId: string, query: ListTransactionsQuery): Promise<Paginated<Transaction>> {
    const page = await this.transactions.list(toStoreQuery(userId, query));

    return {
      data: page.data.map((record) => toTransactionResponse(record)),
      page: page.page,
    };
  }

  /** One transaction, or a 404 — including when it exists but belongs to someone else. */
  async get(reference: OwnedTransactionRef): Promise<Transaction> {
    return toTransactionResponse(await this.requireOwned(reference));
  }

  /**
   * Applies the two fields a customer owns.
   *
   * Setting a category marks the row overridden, and the projector never re-derives an
   * overridden category. Someone who files their gym under Health has told the bank
   * something true that no merchant code can express; a system that quietly reverts that
   * teaches them not to bother correcting it again.
   */
  async update(
    reference: OwnedTransactionRef,
    body: UpdateTransactionRequest,
  ): Promise<Transaction> {
    const updated = await this.transactions.patch({
      id: reference.transactionId,
      userId: reference.userId,
      ...(body.category === undefined ? {} : { category: body.category }),
      ...(body.notes === undefined ? {} : { notes: body.notes }),
    });

    if (!updated) throw notFound(reference.transactionId);
    return toTransactionResponse(updated);
  }

  /**
   * The record behind a route parameter, proven to belong to the caller.
   *
   * Exposed for the export and receipt paths, which need the stored row rather than its
   * wire form. Returning the record keeps the ownership rule in exactly one place.
   */
  async requireOwned(reference: OwnedTransactionRef): Promise<TransactionRecord> {
    const record = await this.transactions.findByPublicId(reference.transactionId);

    // Deliberately indistinguishable from "no such transaction". Answering 403 for a row
    // that exists but is someone else's confirms it exists, which is an enumeration
    // oracle over every transaction in the bank.
    if (!record || record.userId !== reference.userId) throw notFound(reference.transactionId);
    return record;
  }
}

/**
 * Contract query to store query.
 *
 * The wire carries ISO strings and the store wants `Date`s; doing the conversion here
 * rather than in the repository keeps the store's vocabulary free of wire formats.
 */
function toStoreQuery(userId: string, query: ListTransactionsQuery): TransactionListQuery {
  return {
    userId,
    limit: query.limit,
    ...pick(query, ['accountId', 'direction', 'status', 'category', 'type', 'search']),
    ...pick(query, ['minAmount', 'maxAmount', 'cursor']),
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
  };
}

/**
 * Copies only the keys that were actually supplied.
 *
 * `exactOptionalPropertyTypes` is off in this project, so an explicit `undefined` would
 * type-check and then reach Mongo as `{ status: undefined }` — which matches documents
 * where the field is absent rather than matching everything. Omitting the key is the
 * difference between "no filter" and "filter on nothing".
 */
function pick<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const result: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function notFound(transactionId: string): AppError {
  return AppError.notFound('Transaction', transactionId);
}
