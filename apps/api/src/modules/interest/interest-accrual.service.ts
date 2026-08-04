import { Injectable, Logger } from '@nestjs/common';

import { Money } from '@reliance/money';

import { ClockService } from '../../common/clock/clock.service.js';
import { fromStored } from '../../common/money/money.codec.js';

import { dailyAccrualUnits, splitCapitalisation } from './accrual-math.js';
import { AccrualStateStore, type AccrualStateRecord } from './accrual-state.store.js';
import { InterestAccountSource, type InterestBearingAccount } from './interest-account.source.js';
import { InterestTermsSource } from './interest-terms.source.js';
import { ACCRUAL_BATCH_SIZE } from './interest.constants.js';

/** What happened to one account in an accrual run. */
export const AccrualOutcome = {
  ACCRUED: 'ACCRUED',
  ALREADY_ACCRUED: 'ALREADY_ACCRUED',
  WITHOUT_TERMS: 'WITHOUT_TERMS',
  CONFLICT: 'CONFLICT',
  FAILED: 'FAILED',
} as const;
export type AccrualOutcome = (typeof AccrualOutcome)[keyof typeof AccrualOutcome];

/** Tally of one daily run — what the job's metrics record. */
export interface AccrualRunResult {
  readonly asOf: string;
  readonly scanned: number;
  readonly accrued: number;
  readonly alreadyAccrued: number;
  readonly withoutTerms: number;
  readonly conflicts: number;
  readonly failed: number;
}

/** The mutable working copy of a run's counts. */
interface AccrualTally {
  scanned: number;
  accrued: number;
  alreadyAccrued: number;
  withoutTerms: number;
  conflicts: number;
  failed: number;
}

/** Which counter an outcome increments. */
const OUTCOME_COUNTERS: Readonly<Record<AccrualOutcome, keyof AccrualTally>> = {
  [AccrualOutcome.ACCRUED]: 'accrued',
  [AccrualOutcome.ALREADY_ACCRUED]: 'alreadyAccrued',
  [AccrualOutcome.WITHOUT_TERMS]: 'withoutTerms',
  [AccrualOutcome.CONFLICT]: 'conflicts',
  [AccrualOutcome.FAILED]: 'failed',
};

const ZERO_INCREMENT = 0n;

/**
 * The daily accrual: one day of tiered credit interest onto every interest-bearing
 * account's exact accumulator.
 *
 * Nothing is posted. Accrual is an obligation the bank tracks precisely, not a movement
 * of money — the journal entry happens at capitalisation. That separation is what keeps
 * the ledger free of 365 micro-entries per account per year while still letting the
 * bank state, to the fraction of a penny, what it owes.
 *
 * Rerunning a date is a no-op per account: the `lastAccruedOn` stamp and the
 * compare-and-set write turn a retried job into a scan that finds everything done.
 */
@Injectable()
export class InterestAccrualService {
  private readonly logger = new Logger(InterestAccrualService.name);

  constructor(
    private readonly accounts: InterestAccountSource,
    private readonly terms: InterestTermsSource,
    private readonly states: AccrualStateStore,
    private readonly clock: ClockService,
  ) {}

  /**
   * Accrues one day, defaulting to the business clock's today, across the whole book.
   *
   * Paged rather than streamed: a run that dies halfway has stamped the accounts it
   * finished, and the rerun resumes past them for free.
   */
  async runDailyAccrual(asOf?: string): Promise<AccrualRunResult> {
    const date = asOf ?? this.clock.today();
    const tally: AccrualTally = {
      scanned: 0,
      accrued: 0,
      alreadyAccrued: 0,
      withoutTerms: 0,
      conflicts: 0,
      failed: 0,
    };

    let afterId: string | undefined;
    for (;;) {
      const page = await this.accounts.listInterestBearing({ afterId, limit: ACCRUAL_BATCH_SIZE });
      if (page.length === 0) break;

      for (const account of page) {
        tally.scanned += 1;
        tally[OUTCOME_COUNTERS[await this.accrueSafely(account, date)]] += 1;
      }

      afterId = page.at(-1)?.id;
      if (page.length < ACCRUAL_BATCH_SIZE) break;
    }

    this.logger.log(`Accrual for ${date}: ${tally.accrued} of ${tally.scanned} accounts accrued`);
    return { asOf: date, ...tally };
  }

  /** Accrues one account for one date. Exported for the run loop and for tests. */
  async accrueOne(account: InterestBearingAccount, asOf: string): Promise<AccrualOutcome> {
    const tiers = await this.terms.creditTiersFor(account.productCode, account.productVersion);
    if (tiers.length === 0) return AccrualOutcome.WITHOUT_TERMS;

    const state = await this.states.findByAccountId(account.id);
    if (isSettledFor(state, asOf)) return AccrualOutcome.ALREADY_ACCRUED;

    return this.applyDay(
      account,
      state,
      dailyAccrualUnits(tiers, fromStored(account.ledgerBalance)),
      asOf,
    );
  }

  /**
   * The interest an account has earned and not yet been paid, in whole minor units.
   *
   * What a statement or an in-app "interest so far" figure reports: the exact
   * accumulator truncated down, the same rounding capitalisation will apply. Null when
   * the account has never accrued.
   */
  async accruedToDate(accountId: string): Promise<Money | null> {
    const state = await this.states.findByAccountId(accountId);
    if (!state) return null;
    return splitCapitalisation(state.numerator, fromStored(state.capitalisedToDate).currency)
      .payable;
  }

  /** Adds one day's increment to the accumulator, compare-and-set on what was read. */
  private async applyDay(
    account: InterestBearingAccount,
    state: AccrualStateRecord | null,
    increment: bigint,
    asOf: string,
  ): Promise<AccrualOutcome> {
    const applied = await this.states.applyAccrual({
      accountId: account.id,
      currency: account.currency,
      expectedLastAccruedOn: state?.lastAccruedOn ?? null,
      expectedNumerator: state?.numerator ?? ZERO_INCREMENT,
      numerator: (state?.numerator ?? ZERO_INCREMENT) + increment,
      accruedOn: asOf,
    });

    return applied ? AccrualOutcome.ACCRUED : AccrualOutcome.CONFLICT;
  }

  /** One account inside the run loop: an error costs a tally, never the whole run. */
  private async accrueSafely(
    account: InterestBearingAccount,
    date: string,
  ): Promise<AccrualOutcome> {
    try {
      return await this.accrueOne(account, date);
    } catch (error) {
      this.logger.warn(
        `Accrual failed for account ${account.id} on ${date}: ${(error as Error).message}`,
      );
      return AccrualOutcome.FAILED;
    }
  }
}

/** True when the account's accrual for `asOf` (or a later date) is already done. */
function isSettledFor(state: AccrualStateRecord | null, asOf: string): boolean {
  return state?.lastAccruedOn != null && state.lastAccruedOn >= asOf;
}
