import { SimJob } from '@reliance/contracts';

import type { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import type { IdGenerator } from '../../../common/ids/id-generator.js';
import type { AccountService } from '../../accounts/account.service.js';
import type { PostingService } from '../../ledger/posting.service.js';
import { SimulationController } from '../simulation.controller.js';
import { SimulationService } from '../simulation.service.js';
import type { SnapshotStore } from '../snapshot.store.js';

describe('Simulation service and controller', () => {
  function rig() {
    const clock = {
      realNow: jest.fn(() => new Date('2026-03-01T09:00:00.000Z')),
      now: jest.fn(() => new Date('2026-03-01T09:00:00.000Z')),
      today: jest.fn(() => new Date('2026-03-01T00:00:00.000Z')),
      offsetSeconds: 1800,
      isFrozen: false,
      advance: jest.fn(),
      reset: jest.fn(),
      freezeAt: jest.fn(),
    } as unknown as ClockService;

    const rateProvider = {
      midFor: jest.fn(async () => ({ rate: { value: 1000n, scale: 4 } })),
      nudge: jest.fn(),
    } as unknown as { midFor: jest.Mock; nudge: jest.Mock };

    const postings = {
      post: jest.fn(async () => ({ id: 'entry_001' })),
    } as unknown as PostingService;

    const accounts = {
      require: jest.fn(async () => ({ id: 'acc_001' })),
    } as unknown as AccountService;

    const ids = {
      generate: jest.fn(() => 'audit_001'),
    } as unknown as IdGenerator;

    const snapshots = {
      list: jest.fn(() => [{ id: 'snap_001', label: 'baseline', offsetMs: 0, frozenAt: null, createdAt: '2026-03-01T09:00:00.000Z' }]),
      save: jest.fn(),
      find: jest.fn((id: string) => ({ id, label: 'baseline', offsetMs: 0, frozenAt: null, createdAt: '2026-03-01T09:00:00.000Z' })),
    } as unknown as SnapshotStore;

    const service = new SimulationService(clock, rateProvider as never, postings, accounts, ids, snapshots);
    const controller = new SimulationController(service);

    return { service, controller, clock, rateProvider, postings, accounts, ids, snapshots };
  }

  it('exposes clock, state and job execution helpers', async () => {
    const { service, clock } = rig();

    expect(service.clockState()).toMatchObject({ offsetSeconds: 1800, frozen: false });
    expect(service.advance({ days: 1, hours: 2, minutes: 3, runScheduledJobs: true })).toMatchObject({ offsetSeconds: 1800 });
    expect(service.reset()).toMatchObject({ offsetSeconds: 1800 });

    const state = await service.state();
    expect(state.snapshotCount).toBe(1);
    expect(state.activeScenario).toBeNull();

    // The queue these jobs were enqueued onto is gone, and no direct runner has replaced it.
    // A dry run says so; a real run refuses rather than reporting work that never happens.
    const dryRun = await service.runJob({ job: SimJob.ACCRUE_INTEREST, dryRun: true });
    expect(dryRun).toEqual({
      processed: 0,
      log: ['[dry-run] ACCRUE_INTEREST has no runner registered'],
    });

    await expect(service.runJob({ job: SimJob.ACCRUE_INTEREST, dryRun: false })).rejects.toThrow(
      /no runner/i,
    );
    expect(clock.advance).toHaveBeenCalled();
  });

  it('mints funds, nudges rates and manages snapshots', async () => {
    const { service, rateProvider, accounts, postings, snapshots } = rig();

    const minted = await service.mint({
      toAccountId: 'acc_001',
      amount: { amount: 100, currency: 'GBP' },
      narrative: 'demo',
    } as never);
    expect(minted.entryId).toBe('entry_001');
    expect(accounts.require).toHaveBeenCalledWith('acc_001');
    expect(postings.post).toHaveBeenCalled();

    const moved = await service.moveRate({ from: 'GBP', to: 'USD', newMid: '1.1200' } as never);
    expect(moved.newMid).toBe('1.1200');
    expect(rateProvider.nudge).toHaveBeenCalled();

    service.runScenario('growth');
    expect(service.generateTraffic({ customers: 3, transactionsPerCustomer: 2, overDays: 7 })).toEqual({ queued: 6 });

    const snapshot = service.takeSnapshot('baseline');
    expect(snapshot.label).toBe('baseline');
    expect(snapshots.save).toHaveBeenCalled();
    expect(service.listSnapshots()).toHaveLength(1);

    const restored = service.restoreSnapshot('snap_001');
    expect(restored.offsetSeconds).toBe(1800);
  });

  it('wraps the simulation routes with the controller contract', async () => {
    const { controller, service } = rig();

    const state = await controller.state();
    expect(state.clock.offsetSeconds).toBe(1800);

    const result = await controller.runJob({ job: SimJob.GENERATE_STATEMENTS, dryRun: true } as never);
    expect(result).toEqual({
      data: {
        job: SimJob.GENERATE_STATEMENTS,
        processed: 0,
        log: ['[dry-run] GENERATE_STATEMENTS has no runner registered'],
      },
    });

    const traffic = controller.generateTraffic({ customers: 2, transactionsPerCustomer: 1, overDays: 2 } as never);
    expect(traffic).toEqual({ data: { queued: 2 } });

    const restored = controller.restoreSnapshot('snap_001');
    expect(restored.offsetSeconds).toBe(1800);

    jest.spyOn(service, 'runScenario').mockImplementation(() => undefined);
    const scenario = controller.runScenario({ scenario: 'PAYDAY' } as never);
    expect(scenario).toEqual({ data: { scenario: 'PAYDAY', status: 'RUNNING' } });
  });

  it('throws when a snapshot cannot be restored', () => {
    const { service, snapshots } = rig();
    (snapshots.find as jest.Mock).mockReturnValueOnce(undefined);

    expect(() => service.restoreSnapshot('missing')).toThrow(AppError);
  });
});
