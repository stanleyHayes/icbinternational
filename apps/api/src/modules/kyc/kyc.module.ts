import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ClockModule } from '../../common/clock/clock.module.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { FilesModule } from '../files/index.js';
import { RbacModule } from '../rbac/index.js';

import { AdminKycController } from './admin-kyc.controller.js';
import { KycCaseRepository } from './kyc-case.repository.js';
import { KycCaseRecord, KycCaseSchema } from './kyc-case.schema.js';
import { KycCaseService } from './kyc-case.service.js';
import { KycDecisionService } from './kyc-decision.service.js';
import { KycDocumentsService } from './kyc-documents.service.js';
import { KycExpiryService } from './kyc-expiry.service.js';
import { KycLivenessService } from './kyc-liveness.service.js';
import { KycPiiStore } from './kyc-pii-store.service.js';
import { KycSubmissionService } from './kyc-submission.service.js';
import { KycTierPort } from './kyc-tier.port.js';
import { KycTierService } from './kyc-tier.service.js';
import { KycUploadSignatureService } from './kyc-upload-signature.service.js';
import { KycController } from './kyc.controller.js';
import { KycPresenter } from './kyc.presenter.js';
import { LivenessPort, OcrPort } from './ports/kyc-vendor.ports.js';
import { SimulatedLivenessVendor, SimulatedOcrVendor } from './ports/simulated-kyc-vendors.js';

/**
 * KYC and onboarding: the tiered verification file every limit in the bank reads.
 *
 * Vendor boundaries are bound here, once: the OCR and liveness ports get their
 * deterministic in-house twins, and a real vendor adapter later is a provider swap,
 * not a refactor. `KycTierPort` is exported for the money-moving lanes — the limits
 * engine's callers read the tier through it, fresh on every check, which is what makes
 * an upgrade lift limits the moment a decision lands.
 *
 * `AuthModule` rides along for the JWT guard and the `SecretCipher` that seals the
 * case's personal answers at rest; `FilesModule` for the private document pipeline
 * (restricted, signed, never publicly addressable); `RbacModule` because the admin
 * controller's guard chain is instantiated inside this module's injector.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: KycCaseRecord.name, schema: KycCaseSchema }]),
    ClockModule,
    AuthModule,
    FilesModule,
    AuditModule,
    RbacModule,
  ],
  controllers: [KycController, AdminKycController],
  providers: [
    KycCaseRepository,
    KycPiiStore,
    KycPresenter,
    KycCaseService,
    KycDocumentsService,
    KycUploadSignatureService,
    KycLivenessService,
    KycSubmissionService,
    KycDecisionService,
    KycExpiryService,
    KycTierService,
    { provide: KycTierPort, useExisting: KycTierService },
    { provide: OcrPort, useClass: SimulatedOcrVendor },
    { provide: LivenessPort, useClass: SimulatedLivenessVendor },
    IdGenerator,
  ],
  exports: [KycTierPort, KycTierService, KycCaseService, KycExpiryService],
})
export class KycModule {}
