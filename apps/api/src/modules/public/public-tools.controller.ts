import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import {
  leadRequestSchema,
  newsletterRequestSchema,
  routes,
  type LeadRequest,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';

import { CalculatorService } from './calculators/calculator.service.js';
import { LeadService } from './leads/lead.service.js';
import { PublicCache, PublicCacheInterceptor } from './public-cache.interceptor.js';
import { PublicRateLimitGuard, RateLimit } from './public-rate-limit.guard.js';
import {
  CALCULATOR_MAX_AGE_SECONDS,
  SUBMISSION_RATE_LIMIT,
  SUBMISSION_RATE_WINDOW_SECONDS,
} from './public.constants.js';
import {
  loanCalculatorQuerySchema,
  savingsCalculatorQuerySchema,
  type LoanCalculation,
  type LoanCalculatorQuery,
  type SavingsCalculation,
  type SavingsCalculatorQuery,
  type SubmissionAccepted,
} from './public.dto.js';

/** The two routes that write, and the only ones on this surface that do. */
const SUBMISSION_LIMIT = {
  limit: SUBMISSION_RATE_LIMIT,
  windowSeconds: SUBMISSION_RATE_WINDOW_SECONDS,
};

/**
 * Calculators and the two forms.
 *
 * The calculators are pure functions of their query string, so they are cached for a day
 * and answered from the edge. The forms write, so they carry a far tighter rate limit —
 * five submissions per address per ten minutes — and are never cached.
 *
 * Neither form reads anything. A lead is written to its own collection with no reference
 * to a user, an account or anything else, which is what makes "no route here can reach
 * customer data" true of the write paths as well as the reads.
 */
@Controller()
@UseGuards(PublicRateLimitGuard)
@UseInterceptors(PublicCacheInterceptor)
export class PublicToolsController {
  constructor(
    private readonly calculators: CalculatorService,
    private readonly leads: LeadService,
  ) {}

  @Get(routes.public.loanCalculator)
  @PublicCache({ maxAgeSeconds: CALCULATOR_MAX_AGE_SECONDS })
  async loan(
    @Query(zodBody(loanCalculatorQuerySchema)) query: LoanCalculatorQuery,
  ): Promise<LoanCalculation> {
    return this.calculators.loan(query);
  }

  @Get(routes.public.savingsCalculator)
  @PublicCache({ maxAgeSeconds: CALCULATOR_MAX_AGE_SECONDS })
  async savings(
    @Query(zodBody(savingsCalculatorQuerySchema)) query: SavingsCalculatorQuery,
  ): Promise<SavingsCalculation> {
    return this.calculators.savings(query);
  }

  @Post(routes.public.leads)
  @HttpCode(HttpStatus.ACCEPTED)
  @PublicCache({ maxAgeSeconds: 0 })
  @RateLimit(SUBMISSION_LIMIT)
  async enquiry(
    @Body(zodBody(leadRequestSchema)) request: LeadRequest,
    @Ip() ip: string,
  ): Promise<SubmissionAccepted> {
    return this.leads.captureEnquiry(request, ip || null);
  }

  @Post(routes.public.newsletter)
  @HttpCode(HttpStatus.ACCEPTED)
  @PublicCache({ maxAgeSeconds: 0 })
  @RateLimit(SUBMISSION_LIMIT)
  async newsletter(
    @Body(zodBody(newsletterRequestSchema)) request: { email: string },
    @Ip() ip: string,
  ): Promise<SubmissionAccepted> {
    return this.leads.captureNewsletter(request.email, ip || null);
  }
}
