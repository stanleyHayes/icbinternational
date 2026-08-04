import { Global, Module } from '@nestjs/common';

import { ClockService } from './clock.service.js';

/** Time is a global dependency; every module reads it and none of them owns it. */
@Global()
@Module({ providers: [ClockService], exports: [ClockService] })
export class ClockModule {}
