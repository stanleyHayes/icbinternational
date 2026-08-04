/**
 * Simulation handlers.
 *
 * Advancing the clock actually advances the clock the fixtures are dated against, so a
 * console that jumps a month forward sees maturity dates and next-payment dates move.
 * Minting credits an account for real, because inbound money the UI can spend is the
 * whole reason the endpoint exists.
 */

import {
  EntryType,
  ErrorCode,
  NotificationCategory,
  routes,
  SimJob,
  TransactionDirection,
  type RailBehaviour,
} from '@reliance/contracts';

import { MOCK_EPOCH_MS } from '../db/clock.js';
import { findAccount, notify, postToAccount } from '../db/ledger.js';
import { makeSnapshot } from '../factories/operations.js';

import {
  failure,
  MockMethod,
  notFound,
  resourceCreated,
  resourceOk,
  route,
  type MockRoute,
} from './kit.js';
import { paginate, paginateStatic } from './paging.js';
import { readMoney } from './read-body.js';

const JOB_DURATION_MS = 1_240;

/** The simulation control room. */
export const simulationHandlers: readonly MockRoute[] = [
  route(MockMethod.GET, routes.simulation.state, ({ db }) =>
    resourceOk({
      clock: clockState(db),
      seed: String(db.seed),
      rails: db.rails,
      activeScenario: db.activeScenario,
      snapshotCount: db.snapshots.length,
    }),
  ),

  route(MockMethod.POST, routes.simulation.advance, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const days = Number(input.days ?? 0);
    const hours = Number(input.hours ?? 0);
    const minutes = Number(input.minutes ?? 0);

    if (days + hours + minutes <= 0) {
      return failure(ErrorCode.VALIDATION_FAILED, 'Advance by at least one unit of time.', {
        details: [{ path: 'days', message: 'advance by at least one unit of time' }],
      });
    }

    db.clock.advance({ days, hours, minutes });
    return resourceOk(clockState(db));
  }),

  route(MockMethod.POST, routes.simulation.reset, ({ db }) => {
    db.clock.reset();
    return resourceOk(clockState(db));
  }),

  route(MockMethod.GET, routes.simulation.clock, ({ db }) => resourceOk(clockState(db))),

  route(MockMethod.PUT, routes.simulation.clock, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    db.clock.setFrozen(input.frozen !== false);
    return resourceOk(clockState(db));
  }),

  route(MockMethod.POST, routes.simulation.runJob, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const job = (input.job as SimJob) ?? SimJob.ACCRUE_INTEREST;
    const dryRun = input.dryRun === true;
    const processed = db.accounts.length;

    return {
      status: 200,
      body: {
        data: {
          job,
          dryRun,
          processed,
          succeeded: processed,
          failed: 0,
          durationMs: JOB_DURATION_MS,
          log: [
            `${job} processed ${processed} accounts`,
            dryRun ? 'Dry run: nothing written' : 'Committed',
          ],
        },
      },
    };
  }),

  route(MockMethod.GET, routes.simulation.rails, ({ db }) => paginateStatic(db.rails)),

  route(MockMethod.PUT, routes.simulation.rails, ({ body, db }) => {
    const submitted = Array.isArray(body) ? (body as Partial<RailBehaviour>[]) : [];
    db.rails = db.rails.map((rail) => {
      const change = submitted.find((candidate) => candidate.rail === rail.rail);
      return change ? { ...rail, ...change } : rail;
    });
    return paginateStatic(db.rails);
  }),

  route(MockMethod.POST, routes.simulation.scenario, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const scenario = String(input.scenario ?? 'PAYDAY');
    db.activeScenario = scenario;

    return jobResult(scenario, db.accounts.length, [
      `Scenario ${scenario} started at ${String(input.intensity ?? 'NORMAL')} intensity`,
    ]);
  }),

  route(MockMethod.POST, routes.simulation.traffic, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const customers = Number(input.customers ?? 0);
    return jobResult('GENERATE_TRAFFIC', customers, [
      `Generated ${customers} customers over ${String(input.overDays ?? 90)} days`,
      `Existing customers untouched: ${db.users.length}`,
    ]);
  }),

  route(MockMethod.POST, routes.simulation.mint, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const accountId = String(input.toAccountId ?? '');
    const account = findAccount(db, accountId);
    if (!account) return failure(ErrorCode.ACCOUNT_NOT_FOUND, 'That account was not found.');

    const amount = readMoney(body, 'amount');
    if (!amount) {
      return failure(ErrorCode.INVALID_AMOUNT, 'An amount is required.', {
        details: [{ path: 'amount', message: 'must be a positive integer string' }],
      });
    }

    const narrative = String(input.narrative ?? 'Simulated inbound settlement');
    postToAccount(db, {
      accountId: account.id,
      amount,
      direction: TransactionDirection.CREDIT,
      type: EntryType.INBOUND_TRANSFER,
      description: narrative,
      counterpartyName: 'External clearing',
    });

    notify(db, {
      category: NotificationCategory.TRANSACTION,
      title: 'Money in',
      body: `${narrative} has landed in your account.`,
    });

    const transfer = db.transfers[0];
    return transfer
      ? resourceCreated(transfer)
      : failure(ErrorCode.INTERNAL_ERROR, 'The mock could not build a transfer record.');
  }),

  route(MockMethod.POST, routes.simulation.moveRate, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const to = String(input.to ?? '');
    const index = db.fxRates.findIndex((rate) => rate.to === to);
    const rate = db.fxRates[index];
    if (index === -1 || !rate) {
      return failure(ErrorCode.RATE_UNAVAILABLE, 'We do not quote that pair.');
    }

    const newMid = String(input.newMid ?? rate.mid);
    const HALF = 2;
    const halfSpread = (Number(newMid) * rate.spreadBps) / 10_000 / HALF;

    db.fxRates[index] = {
      ...rate,
      mid: newMid,
      bid: (Number(newMid) - halfSpread).toFixed(4),
      ask: (Number(newMid) + halfSpread).toFixed(4),
      asOf: db.clock.nowIso(),
    };

    // Any alert the move crosses fires, which is the only way an alerts screen can be
    // demonstrated without waiting for a real market to move.
    db.fxAlerts = db.fxAlerts.map((alert) => {
      if (!alert.active || alert.to !== to) return alert;
      const crossed =
        alert.direction === 'ABOVE'
          ? Number(newMid) >= Number(alert.targetRate)
          : Number(newMid) <= Number(alert.targetRate);
      return crossed ? { ...alert, active: false, triggeredAt: db.clock.nowIso() } : alert;
    });

    return jobResult('MOVE_RATE', 1, [`${rate.from}/${to} moved to ${newMid}`]);
  }),

  route(MockMethod.GET, routes.simulation.snapshots, ({ db, query }) =>
    paginate(db.snapshots, query),
  ),

  route(MockMethod.POST, routes.simulation.snapshots, ({ body, db }) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const snapshot = makeSnapshot({
      clock: db.clock,
      label: String(input.label ?? 'Snapshot'),
      overrides: {
        description: typeof input.description === 'string' ? input.description : null,
        documentCounts: {
          users: db.users.length,
          accounts: db.accounts.length,
          transactions: db.transactions.length,
        },
      },
    });
    db.snapshots.unshift(snapshot);
    return resourceCreated(snapshot);
  }),

  route(MockMethod.POST, routes.simulation.restoreSnapshot(':id'), ({ db, params }) => {
    const snapshot = db.snapshots.find((candidate) => candidate.id === params.id);
    if (!snapshot) return notFound('That snapshot');
    return jobResult('RESTORE_SNAPSHOT', 1, [`Restored "${snapshot.label}"`]);
  }),
];

function clockState(db: {
  clock: { nowIso: () => string; offsetSeconds: number; frozen: boolean };
}) {
  return {
    realNow: new Date(MOCK_EPOCH_MS).toISOString(),
    simulatedNow: db.clock.nowIso(),
    offsetSeconds: db.clock.offsetSeconds,
    frozen: db.clock.frozen,
  };
}

function jobResult(job: string, processed: number, log: string[]) {
  return {
    status: 200,
    body: {
      data: {
        job,
        dryRun: false,
        processed,
        succeeded: processed,
        failed: 0,
        durationMs: JOB_DURATION_MS,
        log,
      },
    },
  };
}
