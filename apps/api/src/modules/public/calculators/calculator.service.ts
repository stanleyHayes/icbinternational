/**
 * The calculators as the site consumes them.
 *
 * The rate comes from the published table by default, so the figure on the calculator and
 * the figure on the rates page cannot disagree — the commonest way a bank's marketing site
 * ends up quoting a rate it no longer offers.
 */

import { Injectable } from '@nestjs/common';

import { Money } from '@reliance/money';

import { AppConfigService } from '../../../config/config.service.js';
import {
  type LoanCalculation,
  type LoanCalculatorQuery,
  type SavingsCalculation,
  type SavingsCalculatorQuery,
} from '../public.dto.js';
import { RatesService } from '../rates.service.js';

import { quoteLoan } from './loan-calculator.js';
import { projectSavings } from './savings-calculator.js';

const MONTHS_IN_FIRST_YEAR = 12;

/** Slugs of the published tables the calculators read their default rate from. */
const BORROWING_TABLE = 'borrowing';
const SAVINGS_TABLE = 'savings';
const LOAN_PRODUCT_PREFIX = 'Personal Loan';
const SAVER_PRODUCT_PREFIX = 'Easy Access';

/** Used only when nothing is published yet, so the calculator still answers on a fresh install. */
const FALLBACK_LOAN_BASIS_POINTS = 990;
const FALLBACK_SAVINGS_BASIS_POINTS = 310;
const FALLBACK_LOAN_LABEL = '9.9% APR representative';
const FALLBACK_SAVINGS_LABEL = '3.10% AER variable';

@Injectable()
export class CalculatorService {
  constructor(
    private readonly rates: RatesService,
    private readonly config: AppConfigService,
  ) {}

  async loan(query: LoanCalculatorQuery): Promise<LoanCalculation> {
    const published = await this.rates.representativeRate(BORROWING_TABLE, LOAN_PRODUCT_PREFIX);
    const basisPoints =
      query.rateBasisPoints ?? published?.rateBasisPoints ?? FALLBACK_LOAN_BASIS_POINTS;

    const quote = quoteLoan({
      principalMinorUnits: BigInt(query.amountMinorUnits),
      annualRateBasisPoints: basisPoints,
      termMonths: query.termMonths,
      currency: this.currency,
    });

    return {
      monthlyPayment: quote.monthlyPayment.toJSON(),
      totalRepayable: quote.totalRepayable.toJSON(),
      totalInterest: quote.totalInterest.toJSON(),
      rateLabel: query.rateBasisPoints
        ? describeRate(basisPoints, 'APR')
        : (published?.rateLabel ?? FALLBACK_LOAN_LABEL),
      termMonths: query.termMonths,
      firstYear: quote.schedule.slice(0, MONTHS_IN_FIRST_YEAR).map((entry) => ({
        month: entry.month,
        payment: Money.fromMinor(entry.paymentMinorUnits, this.currency).toJSON(),
        interest: Money.fromMinor(entry.interestMinorUnits, this.currency).toJSON(),
        principal: Money.fromMinor(entry.principalMinorUnits, this.currency).toJSON(),
        balance: Money.fromMinor(entry.balanceMinorUnits, this.currency).toJSON(),
      })),
    };
  }

  async savings(query: SavingsCalculatorQuery): Promise<SavingsCalculation> {
    const published = await this.rates.representativeRate(SAVINGS_TABLE, SAVER_PRODUCT_PREFIX);
    const basisPoints =
      query.rateBasisPoints ?? published?.rateBasisPoints ?? FALLBACK_SAVINGS_BASIS_POINTS;

    const projection = projectSavings({
      openingBalanceMinorUnits: BigInt(query.openingMinorUnits),
      monthlyDepositMinorUnits: BigInt(query.monthlyMinorUnits),
      annualRateBasisPoints: basisPoints,
      years: query.years,
      currency: this.currency,
    });

    return {
      finalBalance: projection.finalBalance.toJSON(),
      totalDeposited: projection.totalDeposited.toJSON(),
      totalInterest: projection.totalInterest.toJSON(),
      rateLabel: query.rateBasisPoints
        ? describeRate(basisPoints, 'AER')
        : (published?.rateLabel ?? FALLBACK_SAVINGS_LABEL),
      byYear: projection.byYear.map((entry) => ({
        year: entry.year,
        balance: Money.fromMinor(entry.balanceMinorUnits, this.currency).toJSON(),
        interestEarned: Money.fromMinor(entry.interestEarnedMinorUnits, this.currency).toJSON(),
      })),
    };
  }

  private get currency() {
    return this.config.bank.baseCurrency;
  }
}

const BASIS_POINTS_PER_PERCENT = 100;

/**
 * "9.90% APR" from 990 basis points.
 *
 * Integer division and a remainder rather than a division into a float, for the same
 * reason the calculators themselves avoid one.
 */
function describeRate(basisPoints: number, kind: string): string {
  const whole = Math.trunc(basisPoints / BASIS_POINTS_PER_PERCENT);
  const fraction = String(basisPoints % BASIS_POINTS_PER_PERCENT).padStart(2, '0');
  return `${whole}.${fraction}% ${kind}`;
}
