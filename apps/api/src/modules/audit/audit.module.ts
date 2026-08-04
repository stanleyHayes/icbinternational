import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';

import { AuditEventRepository } from './audit-event.repository.js';
import { AuditEventDocument, AuditEventSchema } from './audit-event.schema.js';
import { AuditVerifierService } from './audit-verifier.service.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuditService } from './audit.service.js';

/**
 * The audit trail.
 *
 * `AuditInterceptor` is registered as an `APP_INTERCEPTOR` rather than being bolted onto
 * each controller. It is inert on any handler without `@Audited()`, so global registration
 * costs a metadata lookup per request and removes the failure mode that matters: a new
 * endpoint that mutates customer state and quietly forgets to record it.
 *
 * Registering it here rather than in `AppModule` keeps the wiring with the thing being
 * wired — importing this module is the whole installation.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: AuditEventDocument.name, schema: AuditEventSchema }]),
  ],
  providers: [
    AuditEventRepository,
    AuditService,
    AuditVerifierService,
    // The root module's IdGenerator is not visible here — a module only sees what it
    // imports. A second instance is harmless: ULID uniqueness comes from its 80-bit
    // random part; the monotonic counter only orders ids within one instance.
    IdGenerator,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService, AuditVerifierService],
})
export class AuditModule {}
