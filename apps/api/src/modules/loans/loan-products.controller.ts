/**
 * The public face of borrowing: the catalogue and the calculator.
 *
 * Unauthenticated, because somebody comparing loans has not signed in yet and should not
 * have to. Neither endpoint writes anything or looks at a customer, so the figures are the
 * product's representative ones rather than a personal quote — which is also why nothing
 * here can be used to probe whether a particular person would be lent to.
 *
 * Registered before {@link LoansController} so that `/loans/products` and
 * `/loans/calculate` are matched before the `/loans/:id` pattern that would otherwise
 * swallow them.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';

import {
  loanCalculationRequestSchema,
  routes,
  type LoanCalculationRequest,
  type LoanProduct,
  type LoanQuote,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';

import { LoanQuoteService } from './loan-quote.service.js';

@Controller()
export class LoanProductsController {
  constructor(private readonly quotes: LoanQuoteService) {}

  /** Every borrowing product on sale, with the rates the marketing pages advertise. */
  @Get(routes.borrow.products)
  list(): readonly LoanProduct[] {
    return this.quotes.listProducts();
  }

  /**
   * What a given amount over a given term would cost at the representative rate.
   *
   * A POST despite being a read, because the request carries a money amount and a term
   * that belong in a body rather than in a URL a browser will cache and a proxy will log.
   */
  @Post(routes.borrow.calculate)
  @HttpCode(HttpStatus.OK)
  calculate(
    @Body(zodBody(loanCalculationRequestSchema)) request: LoanCalculationRequest,
  ): LoanQuote {
    return this.quotes.calculate(request);
  }
}
