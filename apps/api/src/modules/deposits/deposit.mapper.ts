/**
 * A stored deposit as the contract publishes it.
 *
 * Accrued and projected interest are computed against the business date rather than
 * stored, so a customer's savings page shows what the deposit is worth *today* without
 * anything having to run overnight to keep a field up to date.
 */

import { type Deposit } from '@reliance/contracts';

import { fromStored, toWire } from '../../common/money/money.codec.js';

import { accruedTo, breakFigures, interestAtMaturity } from './deposit-interest.js';
import { brokenRateBps } from './deposit-rates.js';
import { type DepositRecord } from './deposit.store.js';
import { type BreakDepositQuote } from './deposit.types.js';

/** Maps one deposit, valued as at a business date. */
export function toContractDeposit(deposit: DepositRecord, asOf: string): Deposit {
  const principal = fromStored(deposit.principal);
  const projected = interestAtMaturity({
    principal,
    annualRateBps: deposit.annualRateBps,
    placedOn: deposit.placedOn,
    maturesOn: deposit.maturesOn,
  });

  return {
    id: deposit.id,
    status: deposit.status,
    principal: toWire(principal),
    annualRateBps: deposit.annualRateBps,
    termMonths: deposit.termMonths,
    interestAccrued: toWire(
      accruedTo({
        principal,
        annualRateBps: deposit.annualRateBps,
        placedOn: deposit.placedOn,
        asOf: earlierOf(asOf, deposit.maturesOn),
      }),
    ),
    projectedInterest: toWire(projected),
    maturityValue: toWire(principal.plus(projected)),
    autoRollover: deposit.autoRollover,
    sourceAccountId: deposit.sourceAccountId,
    placedAt: deposit.placedAt.toISOString(),
    maturesOn: deposit.maturesOn,
    brokenAt: deposit.brokenAt ? deposit.brokenAt.toISOString() : null,
  };
}

/** What breaking a deposit on a business date would produce, as the contract renders it. */
export function toBreakQuote(deposit: DepositRecord, asOf: string): BreakDepositQuote {
  const figures = breakFigures({
    principal: fromStored(deposit.principal),
    annualRateBps: deposit.annualRateBps,
    reducedRateBps: brokenRateBps(deposit.annualRateBps),
    placedOn: deposit.placedOn,
    asOf,
  });

  return {
    principal: toWire(figures.principal),
    interestEarned: toWire(figures.interestEarned),
    penaltyRateBps: figures.penaltyRateBps,
    penaltyAmount: toWire(figures.penaltyAmount),
    netProceeds: toWire(figures.netProceeds),
  };
}

/**
 * Interest stops at maturity.
 *
 * A matured deposit sitting unclaimed does not keep earning the term rate — the term is
 * over. Clamping the accrual date here is what stops the savings page quietly inflating
 * the figure every day until the maturity run catches up.
 */
function earlierOf(left: string, right: string): string {
  return left < right ? left : right;
}
