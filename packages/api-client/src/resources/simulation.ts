/**
 * The simulation control room.
 *
 * Advancing the clock is the one method here with consequences that outlive the call:
 * `runScheduledJobs` replays interest accrual, standing orders, statement generation and
 * arrears assessment across the jump. Skipping it leaves the bank in a state no real
 * sequence of events could have produced, which is worse than not advancing at all.
 */

import {
  jobResultSchema,
  paginated,
  railBehaviourSchema,
  resource,
  routes,
  simClockSchema,
  simStateSchema,
  snapshotSchema,
  transferSchema,
  type AdvanceClockRequest,
  type CursorQuery,
  type GenerateTrafficRequest,
  type JobResult,
  type MintFundsRequest,
  type MoveRateRequest,
  type Paginated,
  type RailBehaviour,
  type Resource,
  type RunJobRequest,
  type RunScenarioRequest,
  type SimClock,
  type SimState,
  type Snapshot,
  type Transfer,
} from '@reliance/contracts';

import { withIdempotencyKey } from '../core/idempotency.js';
import type { HttpTransport } from '../core/transport.js';
import type { MutationOptions, QueryOptions } from '../core/types.js';

const stateResource = resource(simStateSchema);
const clockResource = resource(simClockSchema);
const snapshotList = paginated(snapshotSchema);
const snapshotResource = resource(snapshotSchema);
const transferResource = resource(transferSchema);
const railList = paginated(railBehaviourSchema);

/** Body of a snapshot capture. */
export interface CreateSnapshotRequest {
  readonly label: string;
  readonly description?: string;
}

/** Builds the `client.simulation` group. */
export function createSimulationResource(http: HttpTransport) {
  return {
    /** Everything about the simulation: clock, seed, rail behaviour, active scenario. */
    state: (options?: QueryOptions): Promise<Resource<SimState>> =>
      http.get({ ...options, path: routes.simulation.state, schema: stateResource }),

    /** Real time versus simulated time, and whether the clock is frozen. */
    clock: (options?: QueryOptions): Promise<Resource<SimClock>> =>
      http.get({ ...options, path: routes.simulation.clock, schema: clockResource }),

    /** Freezes or unfreezes the simulated clock. */
    setClock: (
      body: { readonly frozen: boolean; readonly simulatedNow?: string },
      options?: MutationOptions,
    ): Promise<Resource<SimClock>> =>
      http.put({ ...options, path: routes.simulation.clock, body, schema: clockResource }),

    /** Jumps time forward, replaying every scheduled job the jump passes over. */
    advance: (body: AdvanceClockRequest, options?: MutationOptions): Promise<Resource<SimClock>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.simulation.advance,
        body,
        schema: clockResource,
      }),

    /** Returns the clock to real time. */
    resetClock: (options?: MutationOptions): Promise<Resource<SimClock>> =>
      http.post({ ...options, path: routes.simulation.reset, schema: clockResource }),

    /** Runs one scheduled job now. `dryRun` reports what it would do and changes nothing. */
    runJob: (body: RunJobRequest, options?: MutationOptions): Promise<JobResult> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.simulation.runJob,
        body,
        schema: jobResultSchema,
      }),

    /** Current failure rates and latencies of every simulated rail. */
    rails: (options?: QueryOptions): Promise<Paginated<RailBehaviour>> =>
      http.get({ ...options, path: routes.simulation.rails, schema: railList }),

    /** Makes a rail flaky, slow, or completely down — used to prove reversal paths work. */
    setRails: (
      body: readonly RailBehaviour[],
      options?: MutationOptions,
    ): Promise<Paginated<RailBehaviour>> =>
      http.put({ ...options, path: routes.simulation.rails, body, schema: railList }),

    /** Runs a scripted scenario: payday, a fraud wave, a market crash. */
    runScenario: (body: RunScenarioRequest, options?: MutationOptions): Promise<JobResult> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.simulation.scenario,
        body,
        schema: jobResultSchema,
      }),

    /** Generates synthetic customers and history. */
    generateTraffic: (
      body: GenerateTrafficRequest,
      options?: MutationOptions,
    ): Promise<JobResult> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.simulation.traffic,
        body,
        schema: jobResultSchema,
      }),

    /**
     * Credits an account from the external clearing account.
     *
     * The contra leg is real. Even simulated money has to come from somewhere, or the
     * trial balance stops summing to zero and the double-entry guarantee is worthless.
     */
    mint: (body: MintFundsRequest, options?: MutationOptions): Promise<Resource<Transfer>> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.simulation.mint,
        body,
        schema: transferResource,
      }),

    /** Moves a mid-market rate, firing any customer alerts it crosses. */
    moveRate: (body: MoveRateRequest, options?: MutationOptions): Promise<JobResult> =>
      http.post({
        ...options,
        path: routes.simulation.moveRate,
        body,
        schema: jobResultSchema,
      }),

    /** Saved database snapshots. */
    snapshots: (query?: CursorQuery, options?: QueryOptions): Promise<Paginated<Snapshot>> =>
      http.get({ ...options, path: routes.simulation.snapshots, query, schema: snapshotList }),

    /** Captures a snapshot of the whole simulated bank. */
    createSnapshot: (
      body: CreateSnapshotRequest,
      options?: MutationOptions,
    ): Promise<Resource<Snapshot>> =>
      http.post({
        ...options,
        path: routes.simulation.snapshots,
        body,
        schema: snapshotResource,
      }),

    /** Restores a snapshot, discarding everything since. */
    restoreSnapshot: (id: string, options?: MutationOptions): Promise<JobResult> =>
      http.post({
        ...withIdempotencyKey(options),
        path: routes.simulation.restoreSnapshot(id),
        schema: jobResultSchema,
      }),
  };
}

/** The `client.simulation` group. */
export type SimulationResource = ReturnType<typeof createSimulationResource>;
