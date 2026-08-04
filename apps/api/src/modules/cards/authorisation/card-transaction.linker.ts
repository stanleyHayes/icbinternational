import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { JournalEntryStore } from '../../ledger/repositories/journal-entry.store.js';
import { TransactionProjectorService } from '../../transactions/transaction-projector.service.js';

/**
 * Turning a posted journal entry into the statement line the customer reads.
 *
 * The projection runs inside the capture's own session, so the row and the money commit
 * together. A statement line written outside the transaction that moved the balance is a
 * line that can exist for a payment that never happened — and the customer disputing it
 * would be right.
 *
 * It is its own collaborator rather than two more constructor arguments on the capture
 * service because "which statement row did this card payment produce?" is a question the
 * refund and dispute paths will ask too, and the answer should not have to be rebuilt.
 */
@Injectable()
export class CardTransactionLinker {
  private readonly logger = new Logger(CardTransactionLinker.name);

  constructor(
    private readonly entries: JournalEntryStore,
    private readonly projector: TransactionProjectorService,
  ) {}

  /**
   * Projects the entry and returns the row belonging to the customer's account.
   *
   * @returns The transaction id, or null when the entry produced no customer-facing row.
   *   Null is a legitimate answer rather than a failure: an entry moving value between
   *   two of the bank's own GL accounts has no statement line, and a caller that treated
   *   that as an error would fail settlement runs for being correct.
   */
  async link(input: {
    journalEntryId: string;
    accountId: string;
    session?: ClientSession;
  }): Promise<string | null> {
    const entry = await this.entries.findByPublicId(input.journalEntryId, input.session);
    if (!entry) {
      this.logger.error(`Journal entry ${input.journalEntryId} is missing; no row projected`);
      return null;
    }

    const rows = await this.projector.project(entry, input.session);
    const mine = rows.find((row) => row.accountId === input.accountId);

    return mine ? mine.id : null;
  }
}
