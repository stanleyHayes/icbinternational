import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { type TransferDestination } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { PayeeTrustService, type PayeeStanding } from '../beneficiaries/index.js';
import { BalanceService } from '../holds/index.js';
import { LimitsService, type LimitQuery } from '../products/index.js';

import { StepUpPort } from './ports/step-up.port.js';

/**
 * Every reason a transfer may be refused, behind one door.
 *
 * The quote path and the execution path both come through here, and that is the point: a
 * rule enforced in two places is a rule that will eventually be enforced in one. The quote
 * runs these checks so the customer is told before they authorise; the execution runs the
 * identical checks inside the transaction, because a quote is good for fifteen minutes and
 * an account can be frozen, emptied or limit-exhausted in fifteen minutes.
 *
 * Nothing here resolves anything. It is handed a source account, an amount and a payee
 * standing and answers yes or no — which is what keeps it to four collaborators and keeps
 * the resolution logic in exactly one other place.
 */
@Injectable()
export class TransferGuardService {
  constructor(
    private readonly balances: BalanceService,
    private readonly limits: LimitsService,
    private readonly trust: PayeeTrustService,
    private readonly stepUp: StepUpPort,
  ) {}

  /** Where the payee stands, and whether the amount pushes the payment into step-up. */
  async assess(input: {
    userId: string;
    destination: TransferDestination;
    ownAccount: boolean;
    amount: Money;
    resolved: { accountId: string; accountNumber: string };
    session?: ClientSession;
  }): Promise<PayeeStanding> {
    return this.trust.assess(input);
  }

  /**
   * The two refusals that apply whether or not the money has been checked.
   *
   * @throws {AppError} `LIMIT_EXCEEDED` or `BENEFICIARY_COOLING_OFF`.
   */
  async assertAllowed(input: {
    limitQuery: LimitQuery;
    debit: Money;
    credit: Money;
    standing: PayeeStanding;
    session?: ClientSession;
  }): Promise<void> {
    await this.limits.check(input.limitQuery, input.debit, input.session);
    this.trust.assertPayable(input.standing, input.credit);
  }

  /**
   * Refuses unless the account can cover the whole debit, fee included.
   *
   * Read inside the caller's session, always. A funds check against a snapshot outside the
   * transaction that spends the money is a check against a balance that no longer exists —
   * and `BalanceService` re-reads and re-checks for exactly that reason.
   *
   * @throws {AppError} `INSUFFICIENT_FUNDS`.
   */
  async assertFunds(accountId: string, debit: Money, session: ClientSession): Promise<void> {
    await this.balances.assertSufficientFunds(accountId, debit, session);
  }

  /** @throws {AppError} `STEP_UP_REQUIRED` when the proof is missing or not this customer's. */
  async assertStepUp(userId: string, token: string | undefined): Promise<void> {
    await this.stepUp.assertSatisfied(userId, token);
  }

  /**
   * Consumes the allowance a payment actually used.
   *
   * Inside the caller's transaction, so a rolled-back payment does not steal the customer's
   * daily limit for money that never moved.
   */
  async recordUsage(limitQuery: LimitQuery, debit: Money, session: ClientSession): Promise<void> {
    await this.limits.record(limitQuery, debit, session);
  }

  /**
   * Stamps the payee as used, saving them first if the customer asked.
   *
   * @returns The payee's id, or null when the destination was not saved and was not asked
   *   to be — an ad-hoc payment to a stranger leaves no address-book entry behind.
   */
  async recordPayee(input: {
    userId: string;
    standing: PayeeStanding;
    destination: TransferDestination;
    currency: string;
    nickname: string | null;
    session?: ClientSession;
  }): Promise<string | null> {
    return this.trust.recordUse(input);
  }
}
