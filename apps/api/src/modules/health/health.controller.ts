import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';

import { routes } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { AppConfigService } from '../../config/config.service.js';

/**
 * Liveness and readiness.
 *
 * The distinction matters to an orchestrator: liveness answers "is this process wedged,
 * restart it", readiness answers "can it serve traffic right now". A bank with a
 * disconnected database is alive but must not receive requests, so readiness checks the
 * dependencies and liveness deliberately does not.
 */
@Controller()
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
  ) {}

  @Get(routes.system.health)
  live() {
    return {
      status: 'ok',
      service: 'reliance-bank-api',
      environment: this.config.nodeEnv,
      simulatedTime: this.clock.now().toISOString(),
      realTime: this.clock.realNow().toISOString(),
      clockOffsetSeconds: this.clock.offsetSeconds,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Get(routes.system.ready)
  async ready() {
    const database = await this.checkDatabase();
    const ready = database.status === 'up';

    return {
      status: ready ? 'ready' : 'not_ready',
      checks: { database },
    };
  }

  /**
   * Verifies the connection is up *and* that it is a replica set primary.
   *
   * A standalone mongo would answer pings happily and then fail every transaction, so
   * "connected" is not a sufficient readiness signal for this application.
   */
  private async checkDatabase(): Promise<DependencyCheck> {
    if (this.connection.readyState !== ConnectionStates.connected) {
      return { status: 'down', detail: `connection state ${this.connection.readyState}` };
    }

    try {
      const info = await this.connection.db?.admin().command({ hello: 1 });
      const replicaSet: unknown = info?.['setName'];

      if (typeof replicaSet !== 'string') {
        return { status: 'down', detail: 'not a replica set — transactions unavailable' };
      }
      if (info?.['isWritablePrimary'] !== true) {
        return { status: 'down', detail: `replica set ${replicaSet} has no writable primary` };
      }
      return { status: 'up', detail: `replica set ${replicaSet}, primary` };
    } catch (error) {
      return { status: 'down', detail: error instanceof Error ? error.message : 'unknown error' };
    }
  }
}

interface DependencyCheck {
  status: 'up' | 'down';
  detail: string;
}
