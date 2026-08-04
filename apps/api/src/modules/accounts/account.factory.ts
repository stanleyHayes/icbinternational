import { Injectable } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { AccountStatus } from '@reliance/contracts';
import { Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { fromWire, toStored } from '../../common/money/money.codec.js';
import { resolveCreditRateBps } from '../products/index.js';

import { type OpeningPlan } from './account-eligibility.service.js';
import { AccountNumberService } from './account-number.service.js';
import { type NewAccount } from './account.store.js';

/**
 * Builds the account document an approved application produces.
 *
 * Separated from `AccountOpeningService` so that "what an account looks like on day one"
 * — which terms are pinned, which balances start at zero, which status it opens in — is
 * one readable function rather than a paragraph inside a transaction.
 *
 * Everything the product decides is copied, not referenced. Repricing the product must
 * not silently reprice an account that was sold under the old terms, and reading the
 * catalogue again inside a posting transaction to find a minimum would make the hottest
 * path in the bank depend on a second collection.
 */
@Injectable()
export class AccountFactory {
  constructor(
    private readonly numbers: AccountNumberService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {}

  /**
   * A complete, unsaved account.
   *
   * @param input.isPrimary Whether this becomes the customer's default account for the
   *   currency — decided by the caller, which is the only party that can see the rest of
   *   the customer's portfolio.
   */
  async build(input: {
    plan: OpeningPlan;
    isPrimary: boolean;
    session?: ClientSession;
  }): Promise<NewAccount> {
    const { plan } = input;
    const identifiers = await this.numbers.allocate(input.session);
    const zero = toStored(Money.zero(plan.currency));
    const minimumOpeningBalance = fromWire(plan.product.minOpeningBalance);

    return {
      id: this.ids.generate('account'),
      userId: plan.userId,
      holderIds: [...plan.holderIds],
      type: plan.accountType,
      status: openingStatus(minimumOpeningBalance),
      currency: plan.currency,
      productCode: plan.product.code,
      productVersion: plan.product.version,
      productName: plan.product.name,
      nickname: plan.nickname,
      number: identifiers.number,
      sortCode: identifiers.sortCode,
      iban: identifiers.iban,
      ledgerBalance: zero,
      availableBalance: zero,
      holdTotal: zero,
      // An arranged overdraft is applied for separately and underwritten separately; no
      // product grants one at opening, so every account starts with no facility at all.
      overdraftLimit: zero,
      minimumOpeningBalance: toStored(minimumOpeningBalance),
      interestRateBps: resolveCreditRateBps(
        plan.product.creditInterestTiers,
        Money.zero(plan.currency),
      ),
      isPrimary: input.isPrimary,
      openedAt: this.clock.now(),
    };
  }
}

/**
 * `PENDING` until the opening deposit lands; `ACTIVE` straight away when there is none.
 *
 * This is how the minimum opening balance is actually enforced. Refusing the application
 * outright would be wrong — the customer has nowhere to send the deposit until the
 * account exists — and opening it `ACTIVE` with nothing in it would let a product sold on
 * a hundred-pound minimum be used with zero. A pending account can be credited and
 * nothing else, and the credit that reaches the minimum activates it.
 */
function openingStatus(minimumOpeningBalance: Money): AccountStatus {
  return minimumOpeningBalance.isPositive ? AccountStatus.PENDING : AccountStatus.ACTIVE;
}
