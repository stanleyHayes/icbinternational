import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

import { IdempotencyKeyRepository } from './idempotency-key.repository.js';
import { IdempotencyKeyDocument, IdempotencyKeySchema } from './idempotency-key.schema.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { IdempotencyService } from './idempotency.service.js';

/**
 * Replay protection.
 *
 * The interceptor is registered as an `APP_INTERCEPTOR` and is inert on any handler
 * without `@Idempotent()`. Global registration costs one metadata lookup per request and
 * removes the failure mode that matters: a new transfer endpoint whose author remembered
 * the decorator but not the `UseInterceptors` that makes it do anything.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IdempotencyKeyDocument.name, schema: IdempotencyKeySchema },
    ]),
  ],
  providers: [
    IdempotencyKeyRepository,
    IdempotencyService,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
