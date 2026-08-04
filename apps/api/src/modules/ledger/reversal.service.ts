import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode, JournalEntryStatus } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { TransactionRunner } from '../../database/transaction.runner.js';

import {
  LEDGER_TRANSACTION_LABEL,
  MAX_REFERENCE_LENGTH,
  REVERSAL_REFERENCE_PREFIX,
} from './ledger.constants.js';
import { toDomainEntry } from './ledger.mapper.js';
import { PostingService } from './posting.service.js';
import { JournalEntryStore, type JournalEntryRecord } from './repositories/journal-entry.store.js';

/**
 * Undoing a posting without editing history.
 *
 * A reversal is a new entry whose every leg is the mirror of the original's, so it
 * balances by exactly the construction the original did and every balance it touches
 * returns to where it started. The original is left byte-for-byte intact and merely
 * marked `REVERSED` with a pointer to what undid it — a statement reprinted afterwards
 * shows both lines, which is what a customer disputing a charge is entitled to see.
 *
 * Deleting or amending the original would be faster and is never acceptable: an audit
 * trail you can rewrite is not an audit trail.
 */
@Injectable()
export class ReversalService {
  private readonly logger = new Logger(ReversalService.name);

  constructor(
    private readonly posting: PostingService,
    private readonly entries: JournalEntryStore,
    private readonly runner: TransactionRunner,
    private readonly clock: ClockService,
  ) {}

  /**
   * Posts the entry that undoes `entryId` and marks the original reversed.
   *
   * Both writes share one transaction. Splitting them would allow a state where the
   * reversal exists but the original still reads `POSTED`, and the next operator to look
   * would reverse it a second time.
   *
   * @returns The reversing entry, freshly posted.
   */
  async reverse(input: ReversalInput): Promise<JournalEntryRecord> {
    return this.runner.runIn(input.session, (session) => this.reverseWithin(input, session), {
      label: LEDGER_TRANSACTION_LABEL.REVERSE,
    });
  }

  private async reverseWithin(
    input: ReversalInput,
    session: ClientSession,
  ): Promise<JournalEntryRecord> {
    const original = await this.entries.findByPublicId(input.entryId, session);
    if (!original) throw AppError.notFound('Journal entry', input.entryId);

    assertReversible(original);

    const reversal = toDomainEntry(original).buildReversal({
      reference: reversalReference(original.reference),
      reversesEntryId: original.id,
      reason: input.reason,
      valueDate: this.clock.today(),
      bookedAt: this.clock.now(),
    });

    const posted = await this.posting.post(reversal, session);

    await this.entries.markReversed({
      entryId: original.id,
      reversedByEntryId: posted.id,
      session,
    });

    this.logger.log(`Entry ${original.id} reversed by ${posted.id}: ${input.reason}`);
    return posted;
  }
}

export interface ReversalInput {
  readonly entryId: string;
  /** Recorded in the reversal's description and metadata. Shown on the statement. */
  readonly reason: string;
  readonly session?: ClientSession;
}

function assertReversible(entry: JournalEntryRecord): void {
  if (entry.status === JournalEntryStatus.REVERSED) {
    throw AppError.conflict(
      ErrorCode.TRANSACTION_NOT_REVERSIBLE,
      `Entry ${entry.id} was already reversed by ${entry.reversedByEntryId ?? 'another entry'}.`,
    );
  }

  if (entry.status !== JournalEntryStatus.POSTED) {
    throw new AppError({
      code: ErrorCode.TRANSACTION_NOT_REVERSIBLE,
      message: `Entry ${entry.id} is ${entry.status} and has not moved any balance to undo.`,
    });
  }
}

/**
 * Derives the reversal's reference from the original's.
 *
 * Prefixing keeps the two visibly related in a search and keeps the reversal's own
 * reference unique, which is what makes reversing twice impossible even if the status
 * guard above were somehow bypassed.
 *
 * Truncation is refused rather than applied: a silently shortened reference could collide
 * with another entry's, and the unique index would then reject a legitimate reversal for
 * reasons nobody could reconstruct from the logs.
 */
export function reversalReference(original: string): string {
  const reference = `${REVERSAL_REFERENCE_PREFIX}${original}`;

  if (reference.length > MAX_REFERENCE_LENGTH) {
    throw new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message:
        `Reference "${original}" is too long to reverse: prefixing it would exceed the ` +
        `${MAX_REFERENCE_LENGTH}-character limit the clearing rails impose.`,
    });
  }

  return reference;
}
