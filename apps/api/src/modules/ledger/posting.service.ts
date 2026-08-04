import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { TransactionRunner } from '../../database/transaction.runner.js';
import { type JournalEntry } from '../../domain/ledger/index.js';

import { LEDGER_TRANSACTION_LABEL } from './ledger.constants.js';
import { toNewJournalEntry } from './ledger.mapper.js';
import { AccountBalancePort } from './ports/account-balance.port.js';
import { aggregateCustomerEffects, aggregateLedgerEffects } from './posting-effects.js';
import { assertControlAccountsRespected } from './posting-rules.js';
import { JournalEntryStore, type JournalEntryRecord } from './repositories/journal-entry.store.js';
import { LedgerAccountStore } from './repositories/ledger-account.store.js';

/**
 * The only way money moves in Reliance Bank.
 *
 * One call writes three things and either all of them land or none of them do:
 *
 * 1. the immutable journal entry — the system of record;
 * 2. the general-ledger balance projection, one update per account and currency;
 * 3. the customer balance projection, through `AccountBalancePort`.
 *
 * Items 2 and 3 are *projections*. They exist because reading a balance must not mean
 * replaying a decade of postings, and they are correct only for as long as nothing writes
 * them except this service. That is why `PostingService` is the sole writer and why
 * `LedgerVerifierService` rebuilds them from scratch and diffs, nightly and in CI.
 *
 * Idempotency is layered. The `@Idempotent()` interceptor stops a replayed HTTP request;
 * the read-before-write below stops a retried job; the unique index on `reference` stops
 * two racing processes. Each catches what the one above it cannot see.
 */
@Injectable()
export class PostingService {
  private readonly logger = new Logger(PostingService.name);

  constructor(
    private readonly entries: JournalEntryStore,
    private readonly ledgerAccounts: LedgerAccountStore,
    private readonly balances: AccountBalancePort,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Books a balanced entry and moves every balance it touches.
   *
   * @param entry A domain entry. Being able to construct one already proves it balances.
   * @param session Join a caller's transaction instead of opening one — a transfer that
   *   also writes a `transfers` document needs the two writes to commit together.
   * @returns The persisted entry. On a replay, the entry that was already there.
   */
  async post(entry: JournalEntry, session?: ClientSession): Promise<JournalEntryRecord> {
    assertControlAccountsRespected(entry);

    if (session) {
      return this.runner.runIn(session, (active) => this.postWithin(entry, active));
    }

    try {
      return await this.runner.run((active) => this.postWithin(entry, active), {
        label: LEDGER_TRANSACTION_LABEL.POST,
      });
    } catch (error) {
      return this.recoverFromDuplicate(entry, error);
    }
  }

  /**
   * The transactional body. Every read and write threads `session`.
   *
   * Order matters. The idempotency check and the postability checks run first so a replay
   * or a frozen account costs one query and no writes. The entry is written before the
   * balances so that, at every instant a concurrent reader could observe, the projections
   * are backed by a journal entry rather than the other way round.
   */
  private async postWithin(
    entry: JournalEntry,
    session: ClientSession,
  ): Promise<JournalEntryRecord> {
    const existing = await this.entries.findByReference(entry.reference, session);
    if (existing) {
      this.logger.log(`Entry ${existing.id} already books reference ${entry.reference}; reusing`);
      return existing;
    }

    await this.assertAccountsPostable(entry, session);

    const record = await this.entries.insert(toNewJournalEntry(entry), session);
    await this.applyLedgerEffects(entry, session);
    await this.applyCustomerEffects(entry, session);

    return record;
  }

  private async assertAccountsPostable(entry: JournalEntry, session: ClientSession): Promise<void> {
    for (const accountId of entry.affectedAccountIds) {
      await this.balances.assertPostable(accountId, session);
    }
  }

  private async applyLedgerEffects(entry: JournalEntry, session: ClientSession): Promise<void> {
    for (const effect of aggregateLedgerEffects(entry.postings)) {
      await this.ledgerAccounts.applyEffect({ code: effect.target, delta: effect.delta, session });
    }
  }

  private async applyCustomerEffects(entry: JournalEntry, session: ClientSession): Promise<void> {
    for (const effect of aggregateCustomerEffects(entry.postings)) {
      await this.balances.applyDelta({
        accountId: effect.target,
        delta: effect.delta,
        session,
      });
    }
  }

  /**
   * Turns a lost race into the winner's result.
   *
   * Two processes can pass the read-before-write check at the same instant; the unique
   * index then rejects the second insert and aborts its transaction. Nothing of the loser
   * survives, so re-reading the reference yields the winner's entry — which is precisely
   * what an idempotent `post` should return. Booking once was never in doubt; this only
   * decides whether the caller sees an error or the answer.
   *
   * Deliberately not attempted when the caller supplied a session: their transaction is
   * already aborted, so anything we read now is outside it and cannot be trusted.
   */
  private async recoverFromDuplicate(
    entry: JournalEntry,
    error: unknown,
  ): Promise<JournalEntryRecord> {
    if (!isDuplicateReferenceError(error)) throw error;

    const winner = await this.entries.findByReference(entry.reference);
    if (!winner) throw error;

    this.logger.warn(
      `Lost the race to book ${entry.reference}; returning entry ${winner.id} posted concurrently`,
    );
    return winner;
  }
}

const DUPLICATE_KEY_CODE = 11_000;
const REFERENCE_FIELD = 'reference';

/** Narrows a driver error to "the unique index on `reference` rejected this insert". */
function isDuplicateReferenceError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ((error as { code?: unknown }).code !== DUPLICATE_KEY_CODE) return false;

  const keyPattern: unknown = (error as { keyPattern?: unknown }).keyPattern;
  if (typeof keyPattern === 'object' && keyPattern !== null) {
    return REFERENCE_FIELD in keyPattern;
  }

  // Some driver paths report the duplicate without a key pattern. The message always
  // names the index, and treating an unrecognised duplicate as fatal is the safe default.
  return String((error as { message?: unknown }).message ?? '').includes(REFERENCE_FIELD);
}
