import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { type Money } from '@reliance/money';

import { AccountBalancePort } from '../ledger/ports/account-balance.port.js';
import { type JournalEntryRecord } from '../ledger/repositories/journal-entry.store.js';

import { CategorisationService } from './categorisation.service.js';
import { AccountOwnerPort } from './ports/account-owner.port.js';
import { customerEffects, type CustomerEffect } from './projection/customer-effects.js';
import { buildTransactionRow, mccOf } from './projection/transaction-row.js';
import { TransactionStore, type TransactionRecord } from './repositories/transaction.store.js';

/**
 * Turns a booked journal entry into the lines a customer reads.
 *
 * Called by whichever module posted the entry, inside that entry's transaction, so the
 * projection and the money commit together. A row written outside the posting transaction
 * can survive a rollback and show a customer a payment the ledger says never happened.
 *
 * **Idempotent by construction.** `(journalEntryId, accountId)` is a unique index, and
 * this service checks it before writing and recovers from it after: a replayed entry —
 * from a retried job, a redelivered message, a reconciliation sweep — yields the row that
 * is already there rather than a duplicate. The check comes first for a second reason
 * that is easy to miss: on a replay the account's balance has moved on, so re-deriving
 * `runningBalance` would overwrite a correct historical value with today's.
 *
 * The projection is never the source of truth. Every money-bearing field here can be
 * rebuilt from `journal_entries`, and if the two ever disagree the journal wins.
 */
@Injectable()
export class TransactionProjectorService {
  private readonly logger = new Logger(TransactionProjectorService.name);

  constructor(
    private readonly transactions: TransactionStore,
    private readonly balances: AccountBalancePort,
    private readonly owners: AccountOwnerPort,
    private readonly categories: CategorisationService,
  ) {}

  /**
   * Emits one row per customer account the entry touched.
   *
   * @param entry A *persisted* entry. Projecting an unsaved one would mint rows pointing
   *   at an id that may never exist.
   * @param session The posting transaction. Omitting it is legal only for a backfill,
   *   where there is no entry write to commit alongside.
   * @returns Every row for this entry — the ones just written and the ones already there.
   */
  async project(entry: JournalEntryRecord, session?: ClientSession): Promise<TransactionRecord[]> {
    const rows: TransactionRecord[] = [];

    for (const effect of customerEffects(entry.postings)) {
      const row = await this.projectOne(entry, effect, session);
      if (row) rows.push(row);
    }

    return rows;
  }

  private async projectOne(
    entry: JournalEntryRecord,
    effect: CustomerEffect,
    session?: ClientSession,
  ): Promise<TransactionRecord | null> {
    const existing = await this.transactions.findByEntryAndAccount({
      journalEntryId: entry.id,
      accountId: effect.accountId,
      ...(session ? { session } : {}),
    });
    if (existing) return existing;

    const userId = await this.owners.ownerOf(effect.accountId, session);
    if (!userId) return this.skipUnowned(entry, effect);

    const runningBalance = await this.balances.currentBalance(effect.accountId, session);
    if (!runningBalance) return this.skipUnowned(entry, effect);

    return this.write({ entry, effect, userId, runningBalance, session });
  }

  private async write(input: {
    entry: JournalEntryRecord;
    effect: CustomerEffect;
    userId: string;
    runningBalance: Money;
    session?: ClientSession;
  }): Promise<TransactionRecord> {
    const row = buildTransactionRow({
      entry: input.entry,
      accountId: input.effect.accountId,
      userId: input.userId,
      net: input.effect.net,
      runningBalance: input.runningBalance,
      category: this.categories.categorise({
        type: input.entry.type,
        mcc: mccOf(input.entry),
      }),
    });

    try {
      return await this.transactions.insert(row, input.session);
    } catch (error) {
      return this.recoverFromDuplicate(input.entry, input.effect, error);
    }
  }

  /**
   * Turns a lost race into the winner's row.
   *
   * Two processes can pass the read-before-write check at the same instant; the unique
   * index rejects the second insert. Re-reading the pair yields the winner's row, which
   * is exactly what an idempotent projection should return. Only one row was ever going
   * to exist; this decides whether the caller sees it or an error.
   *
   * Not attempted when a session is in play: that transaction is already doomed, so
   * anything read now is outside it and cannot be trusted.
   */
  private async recoverFromDuplicate(
    entry: JournalEntryRecord,
    effect: CustomerEffect,
    error: unknown,
  ): Promise<TransactionRecord> {
    if (!isDuplicateKeyError(error)) throw error;

    const winner = await this.transactions.findByEntryAndAccount({
      journalEntryId: entry.id,
      accountId: effect.accountId,
    });
    if (!winner) throw error;

    this.logger.warn(
      `Lost the race to project ${entry.id} onto ${effect.accountId}; reusing ${winner.id}`,
    );
    return winner;
  }

  /**
   * Logs and moves on rather than aborting the posting transaction.
   *
   * An account with no owner or no balance is a real defect, but the money has already
   * been booked correctly by the time this runs. Throwing would roll back a valid ledger
   * entry to fix a missing statement line — trading a correct ledger and a gap in the
   * feed for neither. The gap is recoverable by a backfill; the rollback is not.
   */
  private skipUnowned(entry: JournalEntryRecord, effect: CustomerEffect): null {
    this.logger.error(
      `Entry ${entry.id} posted to account ${effect.accountId}, which has no owner or no ` +
        'balance. The ledger is correct; the transaction row was not created.',
    );
    return null;
  }
}

const DUPLICATE_KEY_CODE = 11_000;

/** Narrows a driver error to "the unique index rejected this insert". */
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_CODE
  );
}
