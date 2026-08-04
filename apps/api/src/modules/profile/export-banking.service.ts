/**
 * The "what you hold with us" half of a subject-access copy.
 *
 * Every section goes through the lane's own contract mapper rather than being read off the
 * stored record. That is not tidiness — it is the whole safety argument. Each mapper
 * enumerates the fields it emits, so a card's `panToken` and `pinHash`, an account's
 * internal version counter and a loan's provision balance are absent because the mapper
 * never mentions them, not because this file remembered to delete them. A sensitive column
 * added upstream tomorrow cannot appear in an export written this way.
 *
 * Every query is scoped to the caller's own id, so no section can contain another
 * customer's data. Counterparties are the deliberate exception in reverse: a transaction
 * naming who the customer paid is the customer's own record of their own payment, but the
 * transaction history is not gathered here at all — see `data-export.service.ts`.
 */

import { Injectable } from '@nestjs/common';

import { ClockService } from '../../common/clock/clock.service.js';
import { AccountStore, toContractAccount } from '../accounts/index.js';
import { CardStore, toContractCard } from '../cards/index.js';
import { DepositStore, toContractDeposit } from '../deposits/index.js';
import { LoanStore, toContractLoan } from '../loans/index.js';

/**
 * How many cards a copy gathers.
 *
 * `CardStore.list` is a cursor page, and an export is a one-shot read rather than a feed.
 * The ceiling is far above any real customer; a page is taken rather than a loop so a single
 * request cannot be turned into an unbounded scan.
 */
const CARD_PAGE = 200;

@Injectable()
export class ExportBankingService {
  constructor(
    private readonly accounts: AccountStore,
    private readonly cards: CardStore,
    private readonly loans: LoanStore,
    private readonly deposits: DepositStore,
    private readonly clock: ClockService,
  ) {}

  /** Every account the customer holds, open or closed. */
  async accountsOf(userId: string): Promise<unknown[]> {
    const asOf = this.clock.now();
    const records = await this.accounts.listByUser({ userId });
    return records.map((record) => toContractAccount(record, asOf));
  }

  /** Every card, with no card number and no PIN — see `toContractCard`. */
  async cardsOf(userId: string): Promise<unknown[]> {
    const page = await this.cards.list({ userId, limit: CARD_PAGE });
    return page.records.map((record) => toContractCard(record));
  }

  /** Every loan and its instalment schedule. */
  async loansOf(userId: string): Promise<unknown[]> {
    const asOf = this.clock.today();
    const records = await this.loans.list({ userId });
    return records.map((record) => toContractLoan(record, asOf));
  }

  /** Every fixed-term deposit, matured or running. */
  async depositsOf(userId: string): Promise<unknown[]> {
    const asOf = this.clock.today();
    const records = await this.deposits.list({ userId });
    return records.map((record) => toContractDeposit(record, asOf));
  }
}
