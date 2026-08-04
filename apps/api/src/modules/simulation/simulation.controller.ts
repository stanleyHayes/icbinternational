import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import {
  Permission,
  advanceClockRequestSchema,
  generateTrafficRequestSchema,
  mintFundsRequestSchema,
  moveRateRequestSchema,
  routes,
  runJobRequestSchema,
  runScenarioRequestSchema,
  type SimClock,
  type SimState,
} from '@reliance/contracts';

import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { AdminEndpoint } from '../rbac/index.js';

import { SimulationService } from './simulation.service.js';
import { type ClockSnapshot } from './snapshot.store.js';

const SNAPSHOT_ID_PARAM = 'id';

/**
 * The operations console's control room.
 *
 * All twelve simulation routes live here, all guarded with `SIMULATION_RUN`. The contract
 * is in `packages/contracts/src/modules/simulation.ts`; the service is the implementation.
 *
 * Nothing here validates business rules — the simulation's job is to get the bank into a
 * specific state for demonstration, not to model what a real operator would do to a
 * production system.
 */
@Controller()
export class SimulationController {
  constructor(private readonly sim: SimulationService) {}

  @Get(routes.simulation.state)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  async state(): Promise<SimState> {
    return this.sim.state();
  }

  @Get(routes.simulation.clock)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  clock(): SimClock {
    return this.sim.clockState();
  }

  @Post(routes.simulation.advance)
  @HttpCode(HttpStatus.OK)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  advance(
    @Body(zodBody(advanceClockRequestSchema)) request: Parameters<typeof advanceClockRequestSchema.parse>[0],
  ): SimClock {
    return this.sim.advance(advanceClockRequestSchema.parse(request));
  }

  @Post(routes.simulation.reset)
  @HttpCode(HttpStatus.OK)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  reset(): SimClock {
    return this.sim.reset();
  }

  @Post(routes.simulation.runJob)
  @HttpCode(HttpStatus.OK)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  async runJob(
    @Body(zodBody(runJobRequestSchema)) request: Parameters<typeof runJobRequestSchema.parse>[0],
  ): Promise<{ data: { job: string; processed: number; log: string[] } }> {
    const parsed = runJobRequestSchema.parse(request);
    const result = await this.sim.runJob(parsed);
    return {
      data: {
        job: parsed.job,
        processed: result.processed,
        log: result.log,
      },
    };
  }

  @Get(routes.simulation.rails)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  rails(): ReturnType<SimulationService['rails']> {
    return this.sim.rails();
  }

  @Post(routes.simulation.scenario)
  @HttpCode(HttpStatus.OK)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  runScenario(
    @Body(zodBody(runScenarioRequestSchema)) request: Parameters<typeof runScenarioRequestSchema.parse>[0],
  ): { data: { scenario: string; status: string } } {
    const parsed = runScenarioRequestSchema.parse(request);
    this.sim.runScenario(parsed.scenario);
    return { data: { scenario: parsed.scenario, status: 'RUNNING' } };
  }

  @Post(routes.simulation.traffic)
  @HttpCode(HttpStatus.OK)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  generateTraffic(
    @Body(zodBody(generateTrafficRequestSchema)) request: Parameters<typeof generateTrafficRequestSchema.parse>[0],
  ): { data: { queued: number } } {
    const parsed = generateTrafficRequestSchema.parse(request);
    return { data: this.sim.generateTraffic(parsed) };
  }

  @Post(routes.simulation.mint)
  @HttpCode(HttpStatus.CREATED)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  async mint(
    @Body(zodBody(mintFundsRequestSchema)) request: Parameters<typeof mintFundsRequestSchema.parse>[0],
  ): Promise<{ data: { entryId: string } }> {
    const parsed = mintFundsRequestSchema.parse(request);
    return { data: await this.sim.mint(parsed) };
  }

  @Post(routes.simulation.moveRate)
  @HttpCode(HttpStatus.OK)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  async moveRate(
    @Body(zodBody(moveRateRequestSchema)) request: Parameters<typeof moveRateRequestSchema.parse>[0],
  ): Promise<{ data: { from: string; to: string; newMid: string } }> {
    const parsed = moveRateRequestSchema.parse(request);
    return { data: await this.sim.moveRate(parsed) };
  }

  @Get(routes.simulation.snapshots)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  listSnapshots(): { data: ClockSnapshot[] } {
    return { data: this.sim.listSnapshots() };
  }

  @Post(routes.simulation.restoreSnapshot(`:${SNAPSHOT_ID_PARAM}`))
  @HttpCode(HttpStatus.OK)
  @AdminEndpoint(Permission.SIMULATION_RUN)
  restoreSnapshot(@Param(SNAPSHOT_ID_PARAM) id: string): SimClock {
    return this.sim.restoreSnapshot(id);
  }
}
