import { Injectable, Logger } from '@nestjs/common';

import {
  SimJob,
  type AdvanceClockRequest,
  type MintFundsRequest,
  type MoveRateRequest,
  type RailBehaviour,
  type RunJobRequest,
  type SimClock,
  type SimState,
} from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { fromWire } from '../../common/money/money.codec.js';
import { entries } from '../../domain/ledger/recipes/index.js';
import { AccountService } from '../accounts/account.service.js';
import { RateProviderPort } from '../fx/rate-feed/rate-provider.port.js';
import { SimulatedRateProvider } from '../fx/rate-feed/simulated-rate.provider.js';
import { PostingService } from '../ledger/posting.service.js';

import { type ClockSnapshot, SnapshotStore } from './snapshot.store.js';

/** Shape returned by `GET /admin/simulation/rails`. */
export interface RailsState {
  rails: Array<{
    rail: string;
    failureRateBps: number;
    latencyMinMs: number;
    latencyMaxMs: number;
    forceOutage: boolean;
  }>;
}

/** What the active scenario is called, or null when none is running. */
let activeScenario: string | null = null;

/**
 * The operations console's control room.
 *
 * Every operation here is gated behind `SIMULATION_RUN`. Nothing here is reversible via
 * the same channel — advancing time, minting money and changing rails all have real-world
 * equivalents that the product must demonstrate rather than simulate as fantasy.
 *
 * The clock, rate provider and snapshot store are process-local state.  That is acceptable
 * for a development and demonstration tool: the aim is a deterministic, reproducible story,
 * not a distributed-systems exercise.
 */
@Injectable()
export class SimulationService {
  private readonly logger = new Logger(SimulationService.name);

   
  constructor(
    private readonly clock: ClockService,
    private readonly rateProvider: RateProviderPort,
    private readonly postings: PostingService,
    private readonly accounts: AccountService,
    private readonly ids: IdGenerator,
    private readonly snapshots: SnapshotStore,
  ) {}

  // --- Clock ----------------------------------------------------------------

  clockState(): SimClock {
    return {
      realNow: this.clock.realNow().toISOString(),
      simulatedNow: this.clock.now().toISOString(),
      offsetSeconds: this.clock.offsetSeconds,
      frozen: this.clock.isFrozen,
    };
  }

  advance(request: AdvanceClockRequest): SimClock {
    const totalMs =
      request.days * MS_PER_DAY +
      request.hours * MS_PER_HOUR +
      request.minutes * MS_PER_MINUTE;

    this.clock.advance(totalMs);
    this.logger.log(
      `Clock advanced by ${request.days}d ${request.hours}h ${request.minutes}m`,
    );
    return this.clockState();
  }

  reset(): SimClock {
    this.clock.reset();
    this.logger.log('Clock reset to real time');
    return this.clockState();
  }

  // --- State ----------------------------------------------------------------

  async state(): Promise<SimState> {
    return {
      clock: this.clockState(),
      seed: 'demo',
      rails: DEFAULT_RAILS,
      activeScenario,
      snapshotCount: this.snapshots.list().length,
    };
  }

  // --- Rails ----------------------------------------------------------------

  rails(): RailsState {
    return { rails: DEFAULT_RAILS };
  }

  // --- Jobs -----------------------------------------------------------------

  /**
   * Runs a simulation job on demand.
   *
   * There is nothing to run. This used to enqueue onto a BullMQ queue, and it never worked:
   * `ACCRUE_INTEREST` went onto the `ledger` queue under the name `accrue-interest`, while
   * `InterestAccrualProcessor` consumed the `scheduler` queue and answered only to
   * `interest.daily-accrual` — neither the queue nor the name matched, for any job in the
   * map. Every call parked a payload no worker consumed and reported `processed: 1`, which is
   * precisely the stranding `interest.constants.ts` warns about.
   *
   * Removing Redis removed the queue that was swallowing them. Rather than keep reporting
   * success for work that does not happen, this now fails loudly. Wiring each `SimJob` to the
   * service that performs it is the fix; the recurring sweeps (fees, mandates, FX alerts,
   * bill submission and refunds) already run on their own schedule without this endpoint.
   */
  async runJob(request: RunJobRequest): Promise<{ processed: number; log: string[] }> {
    if (!RUNNABLE_SIM_JOBS.has(request.job)) {
      throw AppError.validation('Unknown job', [
        { path: 'job', message: `No runner registered for ${request.job}` },
      ]);
    }

    if (request.dryRun) {
      return { processed: 0, log: [`[dry-run] ${request.job} has no runner registered`] };
    }

    throw AppError.validation('Job has no runner', [
      {
        path: 'job',
        message:
          `${request.job} cannot be run on demand: the job queue was removed and no direct ` +
          'runner has been wired for it yet.',
      },
    ]);
  }

  // --- FX -------------------------------------------------------------------

  async moveRate(request: MoveRateRequest): Promise<{ from: string; to: string; newMid: string }> {
    const provider = this.rateProvider as SimulatedRateProvider;
    if (typeof provider.nudge !== 'function') {
      throw AppError.validation('Rate provider does not support manual nudges', []);
    }

    const current = await this.rateProvider.midFor(request.from, request.to);
    if (!current) {
      throw AppError.notFound('Rate', `${request.from}/${request.to}`);
    }

    // Compute the difference as basis points and apply as a nudge.
    // newMid is stored as a decimal string (e.g. "1.2500"); convert to the same
    // scale as the computed value for comparison.
    const desiredBps = bpsFrom(current.rate.value, request.newMid, current.rate.scale);
    provider.nudge(request.from, request.to, desiredBps);

    this.logger.log(`FX nudge: ${request.from}/${request.to} by ${desiredBps} bps`);
    return { from: request.from, to: request.to, newMid: request.newMid };
  }

  // --- Mint -----------------------------------------------------------------

  async mint(request: MintFundsRequest): Promise<{ entryId: string }> {
    // Look up account to verify it exists and get its currency.
    const account = await this.accounts.require(request.toAccountId);
    const amount = fromWire({ amount: request.amount.amount, currency: request.amount.currency });

    const reference = `SIM-MINT-${this.ids.generate('auditEvent')}`;
    const entry = await this.postings.post(
      entries.simulatedFunding({
        reference,
        accountId: account.id,
        amount,
        description: request.narrative,
        valueDate: this.clock.today(),
        bookedAt: this.clock.now(),
      }),
    );

    this.logger.log(
      `Minted ${amount.format()} to account ${account.id} (entry ${entry.id})`,
    );
    return { entryId: entry.id };
  }

  // --- Scenarios ------------------------------------------------------------

  runScenario(scenario: string): void {
    activeScenario = scenario;
    this.logger.log(`Scenario started: ${scenario}`);
  }

  // --- Traffic --------------------------------------------------------------

  generateTraffic(request: {
    customers: number;
    transactionsPerCustomer: number;
    overDays: number;
  }): { queued: number } {
    const queued = request.customers * request.transactionsPerCustomer;
    this.logger.log(
      `Traffic generation queued: ${queued} transactions for ${request.customers} customers over ${request.overDays} days`,
    );
    return { queued };
  }

  // --- Snapshots ------------------------------------------------------------

  takeSnapshot(label: string, _description?: string): ClockSnapshot {
    const id = this.ids.generate('auditEvent');
    const snapshot: ClockSnapshot = {
      id,
      label,
      offsetMs: this.clock.offsetSeconds * MS_PER_SECOND,
      frozenAt: this.clock.isFrozen ? this.clock.now().toISOString() : null,
      createdAt: this.clock.now().toISOString(),
    };

    this.snapshots.save(snapshot);
    this.logger.log(`Snapshot taken: ${id} (${label})`);
    return snapshot;
  }

  listSnapshots(): ClockSnapshot[] {
    return this.snapshots.list();
  }

  restoreSnapshot(id: string): SimClock {
    const snap = this.snapshots.find(id);
    if (!snap) throw AppError.notFound('Snapshot', id);

    this.clock.reset();
    if (snap.frozenAt) {
      this.clock.freezeAt(new Date(snap.frozenAt));
    } else {
      this.clock.advance(snap.offsetMs);
    }

    this.logger.log(`Snapshot restored: ${id}`);
    return this.clockState();
  }
}

// Default rail configuration — used for the state/rails endpoints.
const DEFAULT_RAILS: RailBehaviour[] = [
  { rail: 'ACH', failureRateBps: 50, latencyMinMs: 1000, latencyMaxMs: 5000, forceOutage: false },
  { rail: 'RTGS', failureRateBps: 10, latencyMinMs: 200, latencyMaxMs: 1000, forceOutage: false },
  { rail: 'SWIFT', failureRateBps: 100, latencyMinMs: 2000, latencyMaxMs: 10000, forceOutage: false },
  { rail: 'CARD_NETWORK', failureRateBps: 20, latencyMinMs: 100, latencyMaxMs: 500, forceOutage: false },
  { rail: 'BILLER', failureRateBps: 200, latencyMinMs: 500, latencyMaxMs: 3000, forceOutage: false },
  { rail: 'SMS', failureRateBps: 100, latencyMinMs: 50, latencyMaxMs: 200, forceOutage: false },
  { rail: 'KYC_VENDOR', failureRateBps: 50, latencyMinMs: 2000, latencyMaxMs: 8000, forceOutage: false },
];

/**
 * The `SimJob` vocabulary the control room may name.
 *
 * Membership only means the name is recognised, not that anything runs — see `runJob`. Kept
 * as the list to wire runners against.
 */
const RUNNABLE_SIM_JOBS: ReadonlySet<string> = new Set([
  SimJob.ACCRUE_INTEREST,
  SimJob.CAPITALISE_INTEREST,
  SimJob.RUN_STANDING_ORDERS,
  SimJob.SETTLE_CARD_BATCH,
  SimJob.SETTLE_TRANSFER_BATCH,
  SimJob.GENERATE_STATEMENTS,
  SimJob.CHARGE_MONTHLY_FEES,
  SimJob.MATURE_DEPOSITS,
  SimJob.ASSESS_ARREARS,
  SimJob.EXPIRE_HOLDS,
  SimJob.RESCREEN_CUSTOMERS,
]);

const MS_PER_SECOND = 1_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_MINUTE = MINUTES_PER_HOUR * MS_PER_SECOND;
const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;
const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;
const BPS_SCALE = 10_000n;

/**
 * Computes the basis-point shift needed to move a rate from its current value to
 * the desired level.
 */
function bpsFrom(currentValue: bigint, desiredMid: string, scale: number): number {
  // Parse the desired mid string to the same scale as the stored value.
  const [intPart = '0', fracPart = ''] = desiredMid.split('.');
  const fracPadded = fracPart.padEnd(scale, '0').slice(0, scale);
  const desiredValue = BigInt(`${intPart}${fracPadded}`);

  if (currentValue === 0n) return 0;
  // bps = (desired - current) / current * 10000
  const delta = (desiredValue - currentValue) * BPS_SCALE;
  return Number(delta / currentValue);
}
