import { EntryType, ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { GL, findGlAccount, type JournalEntry, type Posting } from '../../domain/ledger/index.js';

/**
 * Rules a journal entry must satisfy before the ledger will write it.
 *
 * The domain already guarantees the entry balances. What it cannot know is the *policy*
 * around control accounts, because that depends on who is asking and why — information
 * the domain deliberately does not carry.
 *
 * Pure and framework-free so it can be exhaustively tested, and applied before the
 * transaction opens so a rejected entry costs nothing.
 */

/**
 * Refuses postings that would break a control account's meaning.
 *
 * Two distinct rules, for two distinct failure modes:
 *
 * 1. **Every leg on `2000 Customer Deposits` must name a customer account.** The bank's
 *    single most important identity is `SUM(customer balances) === balance of GL 2000`.
 *    A leg that lands on 2000 without an `accountId` increments the control account and
 *    no customer, and the two sides drift apart permanently — with nothing in the trial
 *    balance to show for it, because the entry itself balances perfectly.
 *
 * 2. **A manual adjustment may not touch any control account.** `LOANS_RECEIVABLE` and
 *    `TERM_DEPOSITS` are legitimately posted to by the loan and deposit engines, which
 *    keep their own subsidiary ledgers in step. An operator typing a manual correction
 *    has no such subsidiary ledger to update, so the aggregate would stop matching what
 *    it aggregates. Corrections to a control account go through the owning engine.
 *
 * @throws {AppError} `VALIDATION_FAILED` — the caller has a defect, not the customer.
 */
export function assertControlAccountsRespected(entry: JournalEntry): void {
  for (const posting of entry.postings) {
    assertCustomerDepositsCarriesAccount(posting);
    assertNotManualControlPosting(entry.type, posting);
  }
}

function assertCustomerDepositsCarriesAccount(posting: Posting): void {
  if (posting.ledgerAccountCode !== GL.CUSTOMER_DEPOSITS) return;
  if (posting.accountId !== null) return;

  throw new AppError({
    code: ErrorCode.VALIDATION_FAILED,
    message:
      `A posting to GL ${GL.CUSTOMER_DEPOSITS} must name the customer account it moves. ` +
      'Without one the control account and the accounts it controls drift apart silently.',
    context: { ledgerAccountCode: posting.ledgerAccountCode, narrative: posting.narrative },
  });
}

function assertNotManualControlPosting(type: EntryType, posting: Posting): void {
  if (type !== EntryType.MANUAL_ADJUSTMENT) return;

  const glAccount = findGlAccount(posting.ledgerAccountCode);
  if (!glAccount?.isControlAccount) return;

  throw new AppError({
    code: ErrorCode.VALIDATION_FAILED,
    message:
      `GL ${glAccount.code} (${glAccount.name}) is a control account and cannot be adjusted ` +
      'manually. Post the correction through the engine that owns its subsidiary ledger.',
    context: { ledgerAccountCode: glAccount.code, entryType: type },
  });
}
