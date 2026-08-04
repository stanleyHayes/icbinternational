import { Injectable, Logger } from '@nestjs/common';

import { Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored } from '../../common/money/money.codec.js';
import { productEntries } from '../../domain/ledger/index.js';
import { PostingService } from '../ledger/posting.service.js';

import { splitCapitalisation } from './accrual-math.js';
import { AccrualStateStore } from './accrual-state.store.js';
import { InterestAccountSource } from './interest-account.source.js';
import { assertValidPeriod, lastDayOfPeriod, previousPeriod } from './interest-calendar.js';
import {
  ACCRUAL_BATCH_SIZE,
  INTEREST_REFERENCE_PREFIX,
  REFERENCE_SEGMENT,
} from './interest.constants.js';

/** What happened to one account in a capitalisation run. */
export const CapitalisationOutcome = {
  CAPITALISED: 'CAPITALISED',
  SKIPPED: 'SKIPPED',
  CONFLICT: 'CONFLICT',
  FAILED: 'FAILED',
} as const;
export type CapitalisationOutcome =
  (typeof CapitalisationOutcome)[keyof typeof CapitalisationOutcome];

/** One account's outcome, with the payout when it capitalised. */
export interface CapitalisationAccountResult {
  readonly outcome: CapitalisationOutcome;
  /** The amount posted — zero when the period earned a fraction below one minor unit. */
  readonly amount: Money | null;
}

/** Tally of one capitalisation run — what the job's metrics record. */
export interface CapitalisationRunResult {
  readonly period: string;
  readonly scanned: number;
  readonly capitalised: number;
  readonly skipped: number;
  readonly conflicts: number;
  readonly failed: number;
}

/** The mutable working copy of a run's counts. */
interface CapitalisationTally {
  scanned: number;
  capitalised: number;
  skipped: number;
  conflicts: number;
  failed: number;
}

/** Which counter an outcome increments. */
const OUTCOME_COUNTERS: Readonly<Record<CapitalisationOutcome, keyof CapitalisationTally>> = {
  [CapitalisationOutcome.CAPITALISED]: 'capitalised',
  [CapitalisationOutcome.SKIPPED]: 'skipped',
  [CapitalisationOutcome.CONFLICT]: 'conflicts',
  [CapitalisationOutcome.FAILED]: 'failed',
};

const EMPTY_NUMERATOR = 0n;

/**
 * The monthly capitalisation: accrued interest becomes real money.
 *
 * Once per period the exact accumulator is truncated to whole minor units and posted as
 * a balanced journal entry — the bank's interest expense against a credit to the
 * customer's deposits — value-dated to the period's last day. The sub-minor remainder
 * stays in the accumulator, so a year of monthly payouts totals exactly the annual rate.
 *
 * Rerunning a period is a no-op per account, at two levels: the `lastCapitalisedPeriod`
 * stamp skips settled accounts cheaply, and the ledger's unique reference turns a replay
 * of the posting itself into a return of the entry already booked. The posting happens
 * before the stamp deliberately — a crash between them replays into the ledger's
 * idempotency rather than stamping a payout that never posted.
 */
@Injectable()
export class InterestCapitalisationService {
  private readonly logger = new Logger(InterestCapitalisationService.name);

  constructor(
    private readonly accounts: InterestAccountSource,
    private readonly states: AccrualStateStore,
    private readonly postings: PostingService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Capitalises one period across the whole book, defaulting to the period before the
   * business clock's today — a run on the first of the month settles the month just ended.
   */
  async runMonthlyCapitalisation(period?: string): Promise<CapitalisationRunResult> {
    const target = period ?? previousPeriod(this.clock.today());
    assertValidPeriod(target);

    const tally: CapitalisationTally = {
      scanned: 0,
      capitalised: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
    };

    let afterId: string | undefined;
    for (;;) {
      const page = await this.accounts.listInterestBearing({ afterId, limit: ACCRUAL_BATCH_SIZE });
      if (page.length === 0) break;

      for (const account of page) {
        tally.scanned += 1;
        tally[OUTCOME_COUNTERS[await this.capitaliseSafely(account.id, target)]] += 1;
      }

      afterId = page.at(-1)?.id;
      if (page.length < ACCRUAL_BATCH_SIZE) break;
    }

    this.logger.log(
      `Capitalisation for ${target}: ${tally.capitalised} of ${tally.scanned} accounts paid`,
    );
    return { period: target, ...tally };
  }

  /** Capitalises one account for one period. Exported for the run loop and for tests. */
  async capitaliseOne(accountId: string, period: string): Promise<CapitalisationAccountResult> {
    const state = await this.states.findByAccountId(accountId);
    if (!state || state.numerator <= EMPTY_NUMERATOR) return skipped();
    if (state.lastCapitalisedPeriod != null && state.lastCapitalisedPeriod >= period) {
      return skipped();
    }

    const currency = fromStored(state.capitalisedToDate).currency;
    const split = splitCapitalisation(state.numerator, currency);
    if (split.payable.isPositive) {
      await this.postInterest(accountId, split.payable, period);
    }

    const applied = await this.states.applyCapitalisation({
      accountId,
      expectedLastCapitalisedPeriod: state.lastCapitalisedPeriod,
      expectedNumerator: state.numerator,
      numerator: split.remainderNumerator,
      period,
      capitalisedToDate: fromStored(state.capitalisedToDate).plus(split.payable),
    });

    return applied
      ? { outcome: CapitalisationOutcome.CAPITALISED, amount: split.payable }
      : { outcome: CapitalisationOutcome.CONFLICT, amount: null };
  }

  /** Books the payout: interest expense against the customer's deposits. */
  private async postInterest(accountId: string, amount: Money, period: string): Promise<void> {
    await this.postings.post(
      productEntries.interestCredit({
        reference: this.reference(accountId, period),
        accountId,
        amount,
        description: 'Monthly interest',
        valueDate: lastDayOfPeriod(period),
        bookedAt: this.clock.now(),
        metadata: { period },
      }),
    );
  }

  /**
   * The ledger reference for one account's payout for one period.
   *
   * Derived rather than generated, so a retried job books nothing new: the unique index
   * on `reference` is what turns "capitalise the same month twice" into a no-op.
   */
  private reference(accountId: string, period: string): string {
    return [INTEREST_REFERENCE_PREFIX, accountId, 'CAP', period].join(REFERENCE_SEGMENT);
  }

  /** One account inside the run loop: an error costs a tally, never the whole run. */
  private async capitaliseSafely(
    accountId: string,
    period: string,
  ): Promise<CapitalisationOutcome> {
    try {
      const { outcome } = await this.capitaliseOne(accountId, period);
      return outcome;
    } catch (error) {
      this.logger.warn(
        `Capitalisation failed for account ${accountId} for ${period}: ${(error as Error).message}`,
      );
      return CapitalisationOutcome.FAILED;
    }
  }
}

function skipped(): CapitalisationAccountResult {
  return { outcome: CapitalisationOutcome.SKIPPED, amount: null };
}
