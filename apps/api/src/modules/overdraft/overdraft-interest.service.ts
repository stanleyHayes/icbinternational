/**
 * Daily interest on drawn facilities, and the sweep that clears them.
 *
 * Both are driven by the business date, so advancing the simulated clock by a month
 * produces a month of daily charges on every overdrawn account — and, where a customer has
 * nominated one, a month of sweeps that keep clearing them.
 *
 * Charging happens before sweeping. A sweep that ran first would clear the balance and the
 * customer would pay nothing for the days they were actually overdrawn.
 */

import { Injectable, Logger } from '@nestjs/common';

import { Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored, toStored } from '../../common/money/money.codec.js';
import { movementEntries, productEntries } from '../../domain/ledger/index.js';
import { AccountService } from '../accounts/index.js';
import { PostingService } from '../ledger/posting.service.js';

import { dailyInterest, utilisationOf } from './overdraft-pricing.js';
import { OVERDRAFT_REFERENCE_PREFIX } from './overdraft.constants.js';
import { OverdraftStore, type OverdraftRecord } from './overdraft.store.js';

/** How many facilities one accrual pass will look at. Keeps a run bounded. */
const ACCRUAL_BATCH_SIZE = 1000;

const MOVEMENT = { INTEREST: 'INT', SWEEP: 'SWP' } as const;

@Injectable()
export class OverdraftInterestService {
  private readonly logger = new Logger(OverdraftInterestService.name);

  constructor(
    private readonly facilities: OverdraftStore,
    private readonly accounts: AccountService,
    private readonly postings: PostingService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Charges one day of interest on every drawn facility, then sweeps what it can.
   *
   * @returns How many facilities were processed, which is what the job's metrics record.
   */
  async runDailyCharge(): Promise<number> {
    const asOf = this.clock.today();
    const due = await this.facilities.listForAccrual({ asOf, limit: ACCRUAL_BATCH_SIZE });

    for (const facility of due) {
      await this.chargeOne(facility, asOf);
      await this.sweep(facility);
    }

    return due.length;
  }

  /**
   * Charges one facility for one day.
   *
   * The date is stamped whether or not anything was charged, so an account that was in
   * credit today is not revisited — and so the "have we done today" check stays a single
   * indexed comparison rather than a search through the ledger.
   */
  async chargeOne(facility: OverdraftRecord, asOf: string): Promise<Money> {
    const account = await this.accounts.require(facility.accountId);
    const balance = fromStored(account.ledgerBalance);
    const interest = dailyInterest(utilisationOf(balance, fromStored(facility.limit)));

    if (interest.isPositive) {
      await this.postings.post(
        productEntries.interestDebit({
          reference: this.reference(facility.id, MOVEMENT.INTEREST, asOf),
          accountId: account.id,
          amount: interest,
          description: 'Overdraft interest',
          valueDate: asOf,
          bookedAt: this.clock.now(),
          metadata: { overdraftId: facility.id },
        }),
      );
    }

    await this.facilities.patch(facility.id, {
      lastAccruedOn: asOf,
      interestChargedToDate: toStored(fromStored(facility.interestChargedToDate).plus(interest)),
    });

    return interest;
  }

  /**
   * Moves money from the nominated account to clear the overdraft, as far as it goes.
   *
   * Partial by design: sweeping only what the funding account can spare means a customer
   * with £40 in savings and £100 overdrawn is £60 overdrawn afterwards, rather than the
   * sweep refusing to act because it cannot finish the job.
   */
  async sweep(facility: OverdraftRecord): Promise<Money> {
    const account = await this.accounts.require(facility.accountId);
    const balance = fromStored(account.ledgerBalance);
    const zero = Money.zero(balance.currency);

    if (!facility.sweepFromAccountId || !balance.isNegative) return zero;

    const source = await this.accounts.require(facility.sweepFromAccountId);
    const available = fromStored(source.availableBalance);
    const shortfall = balance.negate();
    const amount = available.lessThan(shortfall) ? available : shortfall;
    if (!amount.isPositive) return zero;

    const asOf = this.clock.today();
    await this.postings.post(
      movementEntries.internalTransfer({
        reference: this.reference(facility.id, MOVEMENT.SWEEP, asOf),
        fromAccountId: source.id,
        toAccountId: account.id,
        amount,
        description: 'Overdraft repayment',
        valueDate: asOf,
        bookedAt: this.clock.now(),
        metadata: { overdraftId: facility.id },
      }),
    );

    this.logger.log(`Swept ${amount.toString()} to clear overdraft ${facility.id}`);
    return amount;
  }

  /**
   * The ledger reference for one movement on one facility on one date.
   *
   * Derived rather than generated, so a retried job books nothing new: the ledger's unique
   * index on `reference` is what turns "run the daily charge twice" into a no-op.
   */
  private reference(facilityId: string, movement: string, asOf: string): string {
    return [OVERDRAFT_REFERENCE_PREFIX, facilityId, movement, asOf].join('-');
  }
}
