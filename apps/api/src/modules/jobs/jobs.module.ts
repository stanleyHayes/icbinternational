import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { type Queue } from 'bullmq';
import { type RedisOptions } from 'ioredis';

import { API_PREFIX } from '@reliance/contracts';

import { AppConfigService } from '../../config/config.service.js';

import { createBullBoardHandlers } from './bull-board.middleware.js';
import { DeadLetterService } from './dead-letter.service.js';
import { BULL_BOARD_ROUTE, JOB_QUEUE_NAMES, deadLetterQueueName } from './jobs.constants.js';
import { JobQueueRegistry } from './queue.registry.js';
import { JOB_REDIS_CONNECTION, redisOptionsFromUrl } from './redis-connection.js';

/**
 * The job platform: BullMQ queues, retry/backoff policy, dead-lettering with replay,
 * operator endpoints, and the Bull Board UI.
 *
 * Deliberately NOT `@Global()`. A global module's middleware is registered ahead of
 * every non-global module's, which would put the Bull Board admin gate in front of
 * the admin-auth middleware (A-06) that populates `request.adminPermissions` — the
 * board would 401 forever. As a normal module, feature modules import `JobsModule`
 * to inject `JobQueueRegistry`/`DeadLetterService`, and AppModule lists it after the
 * auth module so middleware runs in that order. Nest dedupes module instances, so the
 * many-imports pattern still yields exactly one registry, one set of queues and one
 * DLQ watcher per process.
 *
 * Bull Board mounts here (not in `main.ts`) on `forRoutes('admin/queues')`: Nest
 * applies the app's global prefix to middleware routes, while the board adapter's
 * basePath carries the full URL prefix. The board shows the platform queues and
 * their dead-letter companions.
 */
@Module({
  providers: [
    {
      provide: JOB_REDIS_CONNECTION,
      useFactory: (config: AppConfigService): RedisOptions => redisOptionsFromUrl(config.redisUrl),
      inject: [AppConfigService],
    },
    JobQueueRegistry,
    DeadLetterService,
  ],
  exports: [JobQueueRegistry, DeadLetterService, JOB_REDIS_CONNECTION],
})
export class JobsModule implements NestModule {
  constructor(private readonly registry: JobQueueRegistry) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        ...createBullBoardHandlers({
          queues: this.boardQueues(),
          basePath: `${API_PREFIX}/${BULL_BOARD_ROUTE}`,
        }),
      )
      // Nest applies the app's global prefix to middleware routes, so the route here
      // is the unprefixed path; the adapter's basePath carries the full URL prefix.
      .forRoutes(BULL_BOARD_ROUTE);
  }

  /** Platform queues plus their DLQs, so operators see parked failures on the board. */
  private boardQueues(): Queue[] {
    const names = [...JOB_QUEUE_NAMES, ...JOB_QUEUE_NAMES.map((name) => deadLetterQueueName(name))];
    return names.map((name) => this.registry.getQueue(name));
  }
}
