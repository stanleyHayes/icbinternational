/**
 * The calculator and the indicative decision.
 *
 * Everything here is read-only and free of side effects: a customer moving the sliders on
 * the borrowing page is not applying for anything, and nothing they do on it should write
 * a record, touch their score or leave a footprint. The figures are exactly the ones the
 * application would produce, because they come from the same functions.
 */

import { Injectable } from '@nestjs/common';

import {
  ErrorCode,
  type LoanCalculationRequest,
  type LoanEligibility,
  type LoanProduct,
  type LoanQuote,
} from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { fromWire } from '../../common/money/money.codec.js';

import { buildSchedule } from './amortisation.js';
import { addMonths } from './calendar.js';
import { CreditProfileService } from './credit-profile.service.js';
import { assessEligibility, indicativeAprBps } from './eligibility.js';
import { findLoanProduct, LOAN_PRODUCTS } from './loan-products.catalogue.js';
import { toLoanQuote } from './loan.mapper.js';
import { type LoanEligibilityRequest } from './loans.dto.js';

/** The first instalment falls one month after drawdown, which is the market norm. */
const FIRST_PAYMENT_OFFSET_MONTHS = 1;

@Injectable()
export class LoanQuoteService {
  constructor(
    private readonly clock: ClockService,
    private readonly profiles: CreditProfileService,
  ) {}

  /** The catalogue, exactly as the borrowing pages advertise it. */
  listProducts(): readonly LoanProduct[] {
    return LOAN_PRODUCTS;
  }

  /**
   * An illustrative quote at the product's representative rate.
   *
   * The representative rate, not a personal one: this endpoint is unauthenticated and has
   * no profile to price against. Quoting a customer's own rate here would either require
   * them to sign in to move a slider or invite a guess at their circumstances.
   */
  calculate(request: LoanCalculationRequest): LoanQuote {
    const product = this.requireProduct(request.productCode);
    const amount = fromWire(request.amount);
    this.assertWithinProduct(product, amount, request.termMonths);

    return this.quote({
      product,
      amount,
      termMonths: request.termMonths,
      aprBps: product.representativeAprBps,
    });
  }

  /**
   * An indicative decision for a signed-in customer, with their own rate.
   *
   * Indicative because the income is declared rather than evidenced. Nothing is recorded
   * and nothing is promised — the binding version is the offer that comes out of an
   * application, priced on the same score once documents have been seen.
   */
  async assess(userId: string, request: LoanEligibilityRequest): Promise<LoanEligibility> {
    const product = this.requireProduct(request.productCode);
    const profile = await this.profiles.build(userId, {
      monthlyIncome: fromWire(request.monthlyIncome),
      monthlyDebtPayments: fromWire(request.monthlyDebtPayments),
      employmentMonths: request.employmentMonths,
    });

    return assessEligibility({
      product,
      profile,
      requestedAmount: fromWire(request.amount),
      termMonths: request.termMonths,
    });
  }

  /**
   * The personalised quote an offer is built from.
   *
   * Shared with the application service on purpose: the schedule a customer signs must be
   * the one they were shown, to the penny, and the only way to guarantee that is for both
   * paths to run the same code.
   */
  quote(input: {
    product: LoanProduct;
    amount: Money;
    termMonths: number;
    aprBps: number;
  }): LoanQuote {
    const firstPaymentDate = addMonths(this.clock.today(), FIRST_PAYMENT_OFFSET_MONTHS);

    return toLoanQuote({
      productCode: input.product.code,
      amount: input.amount,
      termMonths: input.termMonths,
      aprBps: input.aprBps,
      arrangementFee: fromWire(input.product.arrangementFee),
      firstPaymentDate,
      schedule: buildSchedule({
        principal: input.amount,
        aprBps: input.aprBps,
        termMonths: input.termMonths,
        firstPaymentDate,
      }),
    });
  }

  /** The rate this customer would be offered on this product. */
  priceFor(product: LoanProduct, creditScore: number): number {
    return indicativeAprBps(product, creditScore);
  }

  /**
   * Resolves a catalogue code.
   *
   * @throws {AppError} `NOT_FOUND` when no such product is on sale.
   */
  requireProduct(code: string): LoanProduct {
    const product = findLoanProduct(code);
    if (product) return product;

    throw new AppError({
      code: ErrorCode.NOT_FOUND,
      message: 'That borrowing product is not one we currently offer.',
      context: { productCode: code },
    });
  }

  /**
   * Refuses a request the product cannot satisfy.
   *
   * @throws {AppError} `VALIDATION_FAILED` with copy naming the limit that was missed, so
   *   the form can tell the customer what to change rather than that something is wrong.
   */
  assertWithinProduct(product: LoanProduct, amount: Money, termMonths: number): void {
    const minimum = fromWire(product.minAmount);
    const maximum = fromWire(product.maxAmount);

    if (amount.lessThan(minimum) || amount.greaterThan(maximum)) {
      throw new AppError({
        code: ErrorCode.VALIDATION_FAILED,
        message:
          `${product.name} is available from ${minimum.format()} to ${maximum.format()}. ` +
          'Adjust the amount and we will requote it.',
      });
    }

    if (termMonths < product.minTermMonths || termMonths > product.maxTermMonths) {
      throw new AppError({
        code: ErrorCode.VALIDATION_FAILED,
        message:
          `${product.name} runs from ${product.minTermMonths} to ${product.maxTermMonths} ` +
          'months. Choose a term inside that range and we will requote it.',
      });
    }
  }
}
