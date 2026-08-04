/**
 * The application lifecycle: draft, documents, offer, expiry.
 *
 * Multi-step because lending is. A customer starts an application before they have their
 * payslips to hand, comes back two days later and expects to find it where they left it.
 * Each step is a transition on one record, so an abandoned application is an application
 * that was abandoned — not a half-written loan somebody has to clean up.
 *
 * The decision itself belongs to {@link LoanDecisionService}. This service gathers, guards
 * and renders; it never judges.
 */

import { Injectable, Logger } from '@nestjs/common';

import { type LoanApplication } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromWire, toStored } from '../../common/money/money.codec.js';

import { toContractApplication } from './loan-application.mapper.js';
import { applicationNotFound, assertDecidable, patchOrThrow } from './loan-application.rules.js';
import { LoanApplicationStore, type LoanApplicationRecord } from './loan-application.store.js';
import { LoanDecisionService } from './loan-decision.service.js';
import { REQUIRED_DOCUMENTS } from './loan-products.catalogue.js';
import { LoanQuoteService } from './loan-quote.service.js';
import { LoanApplicationStatus } from './loan.types.js';
import { type CreateApplicationRequest, type SubmitDocumentsRequest } from './loans.dto.js';

@Injectable()
export class LoanApplicationService {
  private readonly logger = new Logger(LoanApplicationService.name);

  constructor(
    private readonly applications: LoanApplicationStore,
    private readonly quotes: LoanQuoteService,
    private readonly decisions: LoanDecisionService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Starts an application and runs it straight through the engine.
   *
   * A customer who qualifies outright sees an offer on the screen they applied from; one
   * who does not is told what is still needed. Making them press submit and then wait for
   * a decision that was already computable helps nobody.
   */
  async create(userId: string, request: CreateApplicationRequest): Promise<LoanApplication> {
    const product = this.quotes.requireProduct(request.productCode);
    const amount = fromWire(request.amount);
    this.quotes.assertWithinProduct(product, amount, request.termMonths);

    const now = this.clock.now();
    const record = await this.applications.insert({
      userId,
      productCode: product.code,
      status: LoanApplicationStatus.SUBMITTED,
      requestedAmount: toStored(amount),
      termMonths: request.termMonths,
      purpose: request.purpose,
      disbursementAccountId: request.disbursementAccountId,
      declaredMonthlyIncome: toStored(fromWire(request.monthlyIncome)),
      declaredMonthlyDebtPayments: toStored(fromWire(request.monthlyDebtPayments)),
      declaredEmploymentMonths: request.employmentMonths,
      offer: null,
      offerExpiresAt: null,
      declineReasons: [],
      requiredDocumentKinds: [...REQUIRED_DOCUMENTS[product.kind]],
      suppliedDocumentKinds: [],
      creditScore: null,
      debtToIncomeBps: null,
      submittedAt: now,
      decidedAt: null,
      acceptedAt: null,
      createdAt: now,
      loanId: null,
    });

    return toContractApplication(await this.decisions.evaluate(record));
  }

  /** The customer's own applications, newest first. */
  async list(userId: string): Promise<LoanApplication[]> {
    const records = await this.applications.list({ userId });
    return records.map((record) => toContractApplication(record));
  }

  /** One application, resolved through the customer's id so it cannot be read sideways. */
  async get(userId: string, applicationId: string): Promise<LoanApplication> {
    return toContractApplication(await this.require(userId, applicationId));
  }

  /**
   * Records documents and re-runs the decision.
   *
   * Supplying the last outstanding document is by far the most common reason a referred
   * application becomes approvable, so it re-decides on the spot rather than waiting for a
   * nightly job or for an underwriter to notice.
   */
  async submitDocuments(input: {
    userId: string;
    applicationId: string;
    request: SubmitDocumentsRequest;
  }): Promise<LoanApplication> {
    const record = await this.require(input.userId, input.applicationId);
    assertDecidable(record);

    const supplied = new Set([...record.suppliedDocumentKinds, ...input.request.documentKinds]);
    const updated = await patchOrThrow(this.applications, record.id, {
      suppliedDocumentKinds: [...supplied],
      status: LoanApplicationStatus.UNDER_REVIEW,
    });

    return toContractApplication(await this.decisions.evaluate(updated));
  }

  /** Withdraws an application the customer no longer wants. */
  async withdraw(userId: string, applicationId: string): Promise<LoanApplication> {
    const record = await this.require(userId, applicationId);
    const updated = await patchOrThrow(this.applications, record.id, {
      status: LoanApplicationStatus.WITHDRAWN,
      offer: null,
      offerExpiresAt: null,
    });

    return toContractApplication(updated);
  }

  /**
   * Expires offers nobody accepted.
   *
   * Driven by the business date, so advancing the simulated clock past an offer's validity
   * expires it exactly as a month of real time would.
   */
  async expireStaleOffers(limit: number): Promise<number> {
    const stale = await this.applications.listExpiredOffers({ asOf: this.clock.now(), limit });

    for (const application of stale) {
      await patchOrThrow(this.applications, application.id, {
        status: LoanApplicationStatus.OFFER_EXPIRED,
      });
      this.logger.log(`Offer on application ${application.id} expired unaccepted`);
    }

    return stale.length;
  }

  /**
   * Resolves an application the customer owns.
   *
   * @throws {AppError} `NOT_FOUND` — the same answer whether the application is missing or
   *   belongs to somebody else, because a different answer would confirm which.
   */
  async require(userId: string, applicationId: string): Promise<LoanApplicationRecord> {
    const record = await this.applications.findById(applicationId);
    if (!record || record.userId !== userId) throw applicationNotFound(applicationId);
    return record;
  }

  /** Every application awaiting an underwriter, oldest first. Backs the admin queue. */
  async listReferred(): Promise<LoanApplication[]> {
    const records = await this.applications.list({ status: LoanApplicationStatus.REFERRED });
    return records
      .toSorted((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map((record) => toContractApplication(record));
  }
}
