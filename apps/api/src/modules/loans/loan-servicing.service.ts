/**
 * Reading a live loan: the list, the record, the instalment table, and who holds it.
 *
 * Deliberately read-only. Collecting money against a loan is
 * {@link LoanRepaymentService} — a separate concern with a transaction boundary and a
 * concurrency guard in it, and one that would otherwise make the file every controller
 * touches the file where the races live. {@link requireOwned} stays here because both
 * paths, and the settlement and collections services, resolve a loan through it: ownership
 * enforced in one place is ownership enforced.
 */

import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { ErrorCode, type AmortisationRow, type Loan } from '@reliance/contracts';

import { AppError } from '../../common/errors/app-error.js';

import { LoanLedgerService } from './loan-ledger.service.js';
import { toContractLoan, toContractRow } from './loan.mapper.js';
import { LoanStore, type LoanRecord } from './loan.store.js';
import { type LoanStatus } from './loan.types.js';

@Injectable()
export class LoanServicingService {
  constructor(
    private readonly loans: LoanStore,
    private readonly ledger: LoanLedgerService,
  ) {}

  /** The customer's loans, newest advance first. */
  async list(userId: string, status?: LoanStatus): Promise<Loan[]> {
    const records = await this.loans.list({ userId, status });
    const asOf = this.ledger.today();
    return records.map((record) => toContractLoan(record, asOf));
  }

  /** One loan, resolved through the customer's id. */
  async get(userId: string, loanId: string): Promise<Loan> {
    return toContractLoan(await this.requireOwned(userId, loanId), this.ledger.today());
  }

  /** The instalment table, including what has been paid against each row. */
  async schedule(userId: string, loanId: string): Promise<AmortisationRow[]> {
    const loan = await this.requireOwned(userId, loanId);
    return loan.schedule.map((row) => toContractRow(row));
  }

  /**
   * Resolves a loan the customer holds.
   *
   * @throws {AppError} `LOAN_NOT_FOUND` whether the loan is missing or somebody else's.
   */
  async requireOwned(userId: string, loanId: string, session?: ClientSession): Promise<LoanRecord> {
    const loan = await this.loans.findById(loanId, session);
    if (!loan || loan.userId !== userId) throw loanNotFound(loanId);
    return loan;
  }
}

/** The one "no such loan" error, so the customer path and the staff path agree. */
export function loanNotFound(loanId: string): AppError {
  return new AppError({
    code: ErrorCode.LOAN_NOT_FOUND,
    message: 'We could not find that loan.',
    context: { loanId },
  });
}
