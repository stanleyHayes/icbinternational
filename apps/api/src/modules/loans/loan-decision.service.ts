/**
 * Running an application through the engine and recording what came out.
 *
 * The engine itself is pure. This service exists to feed it — assemble the profile, price
 * the product, build the offer schedule — and to write the outcome down. Keeping the two
 * apart means the policy in `decision-engine.ts` can be exercised across a fixture matrix
 * with no database in sight, and the plumbing here can be tested without re-testing the
 * policy.
 */

import { Injectable } from '@nestjs/common';

import { type LoanProduct } from '@reliance/contracts';
import { type Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored, fromWire } from '../../common/money/money.codec.js';

import { addDays } from './calendar.js';
import { CreditProfileService } from './credit-profile.service.js';
import { decide, LoanDecision } from './decision-engine.js';
import { assessEligibility } from './eligibility.js';
import { outstandingDocuments } from './loan-application.mapper.js';
import { applicationNotFound, assertDecidable, patchOrThrow } from './loan-application.rules.js';
import { LoanApplicationStore, type LoanApplicationRecord } from './loan-application.store.js';
import { LoanQuoteService } from './loan-quote.service.js';
import { OFFER_VALIDITY_DAYS } from './loan.constants.js';
import { LoanApplicationStatus } from './loan.types.js';
import { type LoanDecisionRequest } from './loans.dto.js';

/** An offer stands until the end of the day it expires on, not to the minute it was made. */
const END_OF_DAY = 'T23:59:59.000Z';

@Injectable()
export class LoanDecisionService {
  constructor(
    private readonly applications: LoanApplicationStore,
    private readonly quotes: LoanQuoteService,
    private readonly profiles: CreditProfileService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Assesses an application and moves it to whatever the engine decided.
   *
   * The score and debt-to-income are written down whichever way it goes. A decline the
   * bank cannot explain a year later is a decline the bank cannot defend.
   */
  async evaluate(record: LoanApplicationRecord): Promise<LoanApplicationRecord> {
    const product = this.quotes.requireProduct(record.productCode);
    const requestedAmount = fromStored(record.requestedAmount);

    const eligibility = assessEligibility({
      product,
      profile: await this.profiles.build(record.userId, {
        monthlyIncome: fromStored(record.declaredMonthlyIncome),
        monthlyDebtPayments: fromStored(record.declaredMonthlyDebtPayments),
        employmentMonths: record.declaredEmploymentMonths,
      }),
      requestedAmount,
      termMonths: record.termMonths,
    });

    const outcome = decide({
      product,
      eligibility,
      requestedAmount,
      outstandingDocumentKinds: outstandingDocuments(record),
    });

    const scored = await this.patch(record.id, {
      creditScore: eligibility.creditScore,
      debtToIncomeBps: eligibility.debtToIncomeBps,
    });

    return this.apply({
      record: scored,
      outcome,
      product,
      aprBps: eligibility.indicativeAprBps ?? product.representativeAprBps,
    });
  }

  /**
   * An underwriter's decision on a referred case.
   *
   * The engine is not re-run: this path exists precisely because a human disagreed with it
   * or saw something it could not. The score already on file is left alone, so the
   * original assessment stays readable beside the override.
   */
  async decideManually(input: {
    applicationId: string;
    request: LoanDecisionRequest;
  }): Promise<LoanApplicationRecord> {
    const record = await this.requireById(input.applicationId);
    assertDecidable(record);

    if (input.request.decision === 'DECLINE') {
      return this.recordDecline(record, input.request.reasons);
    }

    const product = this.quotes.requireProduct(record.productCode);
    const amount = input.request.approvedAmount
      ? fromWire(input.request.approvedAmount)
      : fromStored(record.requestedAmount);

    return this.makeOffer({
      record,
      product,
      amount,
      aprBps: this.quotes.priceFor(product, record.creditScore ?? 0),
    });
  }

  /** Builds the offer schedule and puts the application on the table. */
  async makeOffer(input: {
    record: LoanApplicationRecord;
    product: LoanProduct;
    amount: Money;
    aprBps: number;
  }): Promise<LoanApplicationRecord> {
    const offer = this.quotes.quote({
      product: input.product,
      amount: input.amount,
      termMonths: input.record.termMonths,
      aprBps: input.aprBps,
    });

    return this.patch(input.record.id, {
      status: LoanApplicationStatus.OFFER_MADE,
      offer,
      offerExpiresAt: new Date(`${addDays(this.clock.today(), OFFER_VALIDITY_DAYS)}${END_OF_DAY}`),
      decidedAt: this.clock.now(),
      declineReasons: [],
    });
  }

  private async apply(input: {
    record: LoanApplicationRecord;
    outcome: ReturnType<typeof decide>;
    product: LoanProduct;
    aprBps: number;
  }): Promise<LoanApplicationRecord> {
    const { record, outcome, product, aprBps } = input;

    if (outcome.decision === LoanDecision.APPROVE) {
      return this.makeOffer({ record, product, amount: outcome.approvedAmount, aprBps });
    }

    if (outcome.decision === LoanDecision.DECLINE) {
      return this.recordDecline(record, outcome.reasons);
    }

    return this.patch(record.id, {
      status: LoanApplicationStatus.REFERRED,
      declineReasons: outcome.reasons,
    });
  }

  private async recordDecline(
    record: LoanApplicationRecord,
    reasons: readonly string[],
  ): Promise<LoanApplicationRecord> {
    return this.patch(record.id, {
      status: LoanApplicationStatus.DECLINED,
      declineReasons: reasons,
      decidedAt: this.clock.now(),
      offer: null,
      offerExpiresAt: null,
    });
  }

  private async requireById(applicationId: string): Promise<LoanApplicationRecord> {
    const record = await this.applications.findById(applicationId);
    if (!record) throw applicationNotFound(applicationId);
    return record;
  }

  private async patch(
    id: string,
    fields: Parameters<LoanApplicationStore['patch']>[1],
  ): Promise<LoanApplicationRecord> {
    return patchOrThrow(this.applications, id, fields);
  }
}
