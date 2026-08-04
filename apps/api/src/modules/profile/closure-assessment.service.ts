/**
 * Gathering everything a closure decision has to look at.
 *
 * Split from the closure itself because the two halves have opposite risk profiles: this
 * one only reads, and the answer it produces is also the answer the refusal is written
 * from. Keeping it separate means the pre-flight and the closure cannot disagree about what
 * the customer holds — there is one gatherer and one set of rules.
 *
 * Every read is scoped to the caller's own id. A relationship-wide read is exactly the
 * shape that leaks somebody else's data when a filter is forgotten, so no query here is
 * built without one.
 */

import { Injectable } from '@nestjs/common';

import { ErrorCode } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';
import { AccountStore, type AccountRecord } from '../accounts/index.js';
import { CardStore } from '../cards/index.js';
import { DepositStore } from '../deposits/index.js';
import { LoanStore } from '../loans/index.js';

import { closureBlockers, type ClosureBlocker, type ClosureSubject } from './closure-blockers.js';

/**
 * How many of a customer's cards are examined.
 *
 * `CardStore.list` is a cursor page rather than a full read. The ceiling is far above any
 * real customer, and a customer somehow past it is one whose closure should be looked at by
 * a person anyway — so overflow refuses rather than silently checking a prefix.
 */
const CARD_SCAN_LIMIT = 200;

@Injectable()
export class ClosureAssessmentService {
  constructor(
    private readonly accounts: AccountStore,
    private readonly cards: CardStore,
    private readonly loans: LoanStore,
    private readonly deposits: DepositStore,
  ) {}

  /** Everything in the customer's way, empty when the relationship is clear to close. */
  async blockers(userId: string): Promise<ClosureBlocker[]> {
    return closureBlockers(await this.gather(userId));
  }

  /** Every account the customer holds, whatever its status. */
  async accountsOf(userId: string): Promise<AccountRecord[]> {
    return this.accounts.listByUser({ userId });
  }

  private async gather(userId: string): Promise<ClosureSubject> {
    const [accounts, cards, loans, deposits] = await Promise.all([
      this.accounts.listByUser({ userId }),
      this.cards.list({ userId, limit: CARD_SCAN_LIMIT + 1 }),
      this.loans.list({ userId }),
      this.deposits.list({ userId }),
    ]);

    if (cards.records.length > CARD_SCAN_LIMIT) throw tooManyCards();

    return { accounts, cards: cards.records, loans, deposits };
  }
}

/**
 * The one case this lane cannot answer for itself.
 *
 * Reported rather than swallowed: quietly checking the first two hundred cards would let a
 * closure through over a card the bank never looked at.
 */
function tooManyCards(): AppError {
  return new AppError({
    code: ErrorCode.PRECONDITION_FAILED,
    message:
      'There is more on your account than we can check from here. Call us on 0800 019 4400 ' +
      'and we will close it with you.',
  });
}
