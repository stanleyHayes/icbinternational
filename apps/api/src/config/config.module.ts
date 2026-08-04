import { Global, Module } from '@nestjs/common';

import { AppConfigService } from './config.service.js';
import { ENVIRONMENT } from './config.tokens.js';
import { loadEnvironment, type Environment } from './configuration.js';

/**
 * Provides validated configuration application-wide.
 *
 * Parsing happens once, at module construction, so a misconfigured environment fails
 * during bootstrap instead of on the first request that happens to need the bad value.
 */
@Global()
@Module({
  providers: [
    { provide: ENVIRONMENT, useFactory: (): Environment => loadEnvironment(process.env) },
    AppConfigService,
  ],
  exports: [ENVIRONMENT, AppConfigService],
})
export class AppConfigModule {}

export { ENVIRONMENT };
