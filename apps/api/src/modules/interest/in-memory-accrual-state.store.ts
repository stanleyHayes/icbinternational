import { Injectable } from '@nestjs/common';

import { toStored } from '../../common/money/money.codec.js';

import {
  AccrualStateStore,
  type AccrualStateRecord,
  type ApplyAccrualInput,
  type ApplyCapitalisationInput,
} from './accrual-state.store.js';

/**
 * An honest, in-memory `AccrualStateStore`.
 *
 * Honest means it enforces the same compare-and-set contract the Mongo repository does:
 * a write whose expected stamps or numerator have moved is refused, so a service test
 * that passes here is exercising the real rerun-safety logic rather than a fake's
 * leniency. Shipped in `src` beside the abstraction, as the ledger and accounts lanes
 * ship theirs, so other suites can wire a full engine without a replica set.
 */
@Injectable()
export class InMemoryAccrualStateStore extends AccrualStateStore {
  private readonly byAccount = new Map<string, AccrualStateRecord>();

  override async findByAccountId(accountId: string): Promise<AccrualStateRecord | null> {
    return this.byAccount.get(accountId) ?? null;
  }

  override async applyAccrual(input: ApplyAccrualInput): Promise<boolean> {
    const existing = this.byAccount.get(input.accountId);
    if (!existing) {
      this.byAccount.set(input.accountId, {
        accountId: input.accountId,
        currency: input.currency,
        numerator: input.numerator,
        lastAccruedOn: input.accruedOn,
        lastCapitalisedPeriod: null,
        capitalisedToDate: { amount: '0', currency: input.currency },
      });
      return true;
    }

    if (!matchesReadState(existing, input.expectedLastAccruedOn, input.expectedNumerator)) {
      return false;
    }

    this.byAccount.set(input.accountId, {
      ...existing,
      numerator: input.numerator,
      lastAccruedOn: input.accruedOn,
    });
    return true;
  }

  override async applyCapitalisation(input: ApplyCapitalisationInput): Promise<boolean> {
    const existing = this.byAccount.get(input.accountId);
    if (!existing) return false;
    if (existing.lastCapitalisedPeriod !== input.expectedLastCapitalisedPeriod) return false;
    if (existing.numerator !== input.expectedNumerator) return false;

    this.byAccount.set(input.accountId, {
      ...existing,
      numerator: input.numerator,
      lastCapitalisedPeriod: input.period,
      capitalisedToDate: toStored(input.capitalisedToDate),
    });
    return true;
  }
}

/** The accrual half of the compare-and-set: stamps and numerator as the caller read them. */
function matchesReadState(
  state: AccrualStateRecord,
  expectedLastAccruedOn: string | null,
  expectedNumerator: bigint,
): boolean {
  return state.lastAccruedOn === expectedLastAccruedOn && state.numerator === expectedNumerator;
}
