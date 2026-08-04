import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, type ClientSession } from 'mongoose';

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../common/errors/app-error.js';

/**
 * Runs work inside a MongoDB multi-document transaction, with retries.
 *
 * Two failure modes matter here and both are transient rather than logical:
 *
 * - **`TransientTransactionError`** — two transactions touched the same document and the
 *   server aborted one. Nothing was committed, so the correct response is to run the whole
 *   callback again. Under concurrent transfers against a shared account this is normal.
 * - **`UnknownTransactionCommitResult`** — the commit *may already have landed*. The only
 *   safe response is to retry the **commit**, on the same session, which MongoDB makes
 *   idempotent. Re-running the callback is not safe and must never happen.
 *
 * The distinction is the whole point of this class. Both labels used to be treated the
 * same way — abort, then replay the callback — and under load that replayed transfers
 * whose commit had in fact succeeded. It surfaced as a concurrency test reporting
 * `QUOTE_NOT_FOUND`: the replay found the quote its own committed attempt had consumed.
 * The single-use quote was the only thing standing between that and a customer being
 * debited twice for one payment, and not every path has such a guard.
 *
 * Anything else is a real error and propagates immediately. The callback must be safe to
 * re-run for the transient case: read inside it, never outside, and never mutate state
 * that lives beyond the transaction.
 */
@Injectable()
export class TransactionRunner {
  private readonly logger = new Logger(TransactionRunner.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Executes `work` in a transaction, retrying on write conflicts.
   *
   * @param work Receives the session; every read and write inside must pass it on.
   * @param options.maxAttempts Total attempts including the first. Default 5.
   * @param options.label Short description used in retry logs.
   */
  async run<T>(
    work: (session: ClientSession) => Promise<T>,
    options: { maxAttempts?: number; label?: string } = {},
  ): Promise<T> {
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const label = options.label ?? 'transaction';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const outcome = await this.attempt(work, label, attempt);
      if (outcome.settled) return outcome.value;

      await sleep(backoffMs(attempt));
    }

    throw new AppError({
      code: ErrorCode.CONFLICT,
      message: 'The account is being updated by another operation. Please try again in a moment.',
      context: { label, maxAttempts },
    });
  }

  /** One attempt. Returns unsettled only when the failure is worth retrying. */
  private async attempt<T>(
    work: (session: ClientSession) => Promise<T>,
    label: string,
    attempt: number,
  ): Promise<{ settled: true; value: T } | { settled: false }> {
    const session = await this.connection.startSession();

    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      const value = await work(session);
      await this.commit(session, label);
      return { settled: true, value };
    } catch (error) {
      await abortQuietly(session);

      // Only a transient abort may replay the callback. An unknown commit result reaches
      // here solely when `commit` has exhausted its own retries, and in that state the
      // transaction may be committed — replaying it could move the money a second time,
      // so it is surfaced to the caller instead.
      if (!isTransient(error)) throw error;

      this.logger.warn(`Retrying ${label} after a transient conflict (attempt ${attempt})`);
      return { settled: false };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Commits, retrying the commit alone when the outcome is unknown.
   *
   * `commitTransaction` is idempotent on a session whose transaction already committed,
   * which is what makes this safe and what makes replaying the callback unsafe. Bounded,
   * because a partition that outlasts every attempt should surface rather than spin.
   */
  private async commit(session: ClientSession, label: string): Promise<void> {
    for (let attempt = 1; attempt <= COMMIT_ATTEMPTS; attempt += 1) {
      try {
        await session.commitTransaction();
        return;
      } catch (error) {
        if (!hasLabel(error, UNKNOWN_COMMIT_LABEL) || attempt === COMMIT_ATTEMPTS) throw error;

        this.logger.warn(
          `Retrying the commit of ${label}; its outcome is unknown (attempt ${attempt})`,
        );
        await sleep(backoffMs(attempt));
      }
    }
  }

  /**
   * Runs `work` inside the supplied session if there is one, or opens a new transaction.
   *
   * Lets a service be composed into a larger transaction without knowing whether it is
   * the outermost caller — a nested `run` would deadlock.
   */
  async runIn<T>(
    session: ClientSession | undefined,
    work: (session: ClientSession) => Promise<T>,
    options?: { label?: string },
  ): Promise<T> {
    return session ? work(session) : this.run(work, options);
  }
}

/**
 * How many times a transient abort may be replayed.
 *
 * Write conflicts on one account document are not exceptional — a payroll account being
 * credited by a batch, or a merchant taking payments, produces exactly this. MongoDB
 * serialises them, so the *n*th caller waits for the *n−1* before it, and the retry budget
 * has to cover that queue or the callers at the back are refused work that would have
 * succeeded a moment later.
 *
 * Five attempts, backing off to 400ms, gave roughly a second and a half. A burst of twelve
 * simultaneous transfers against one account exhausted it for *every* caller: the
 * concurrency suite saw zero of twelve settle, which is not contention being handled but a
 * queue nobody reaches the front of. Eight attempts roughly doubles the window while
 * keeping the worst case near three seconds, which is still inside what a caller waits for
 * a payment.
 *
 * `CONFLICT` after that remains the right answer. It should mean the account is genuinely
 * too hot to serve right now, not that the budget was a little short.
 */
const DEFAULT_MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 25;
const MAX_BACKOFF_MS = 400;

const COMMIT_ATTEMPTS = 3;
const TRANSIENT_LABEL = 'TransientTransactionError';
const UNKNOWN_COMMIT_LABEL = 'UnknownTransactionCommitResult';

function hasLabel(error: unknown, label: string): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const labels: unknown = (error as { errorLabels?: unknown }).errorLabels;
  return Array.isArray(labels) && labels.some((candidate) => String(candidate) === label);
}

/**
 * Whether the callback may safely be run again.
 *
 * True only when nothing was committed. `UnknownTransactionCommitResult` is deliberately
 * absent: it means the opposite — that something may have been.
 */
function isTransient(error: unknown): boolean {
  if (hasLabel(error, TRANSIENT_LABEL)) return true;
  if (typeof error !== 'object' || error === null) return false;

  // Write conflicts surface as code 112 and are not always labelled. They abort the
  // transaction, so nothing was written.
  return (error as { code?: unknown }).code === WRITE_CONFLICT_CODE;
}

const WRITE_CONFLICT_CODE = 112;

/** Exponential backoff with a ceiling, jittered to avoid two retriers resynchronising. */
function backoffMs(attempt: number): number {
  const exponential = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  // Jitter only decorrelates competing retriers. It is not a security decision, so a
  // cheap PRNG is exactly right here.
  // eslint-disable-next-line sonarjs/pseudo-random
  return exponential + Math.floor(Math.random() * BASE_BACKOFF_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function abortQuietly(session: ClientSession): Promise<void> {
  if (!session.inTransaction()) return;
  try {
    await session.abortTransaction();
  } catch {
    // The transaction was already aborted by the server. Nothing useful to do.
  }
}
