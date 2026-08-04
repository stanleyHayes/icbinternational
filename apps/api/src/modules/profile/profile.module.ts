import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ClockModule } from '../../common/clock/clock.module.js';
import { IdGenerator } from '../../common/ids/id-generator.js';
import { AccountsModule } from '../accounts/index.js';
import { AuditModule } from '../audit/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../auth/users/index.js';
import { CardsModule } from '../cards/index.js';
import { DepositsModule } from '../deposits/index.js';
import { KycModule } from '../kyc/index.js';
import { LoansModule } from '../loans/index.js';
import { MfaModule } from '../mfa/mfa.module.js';
import { NotificationsModule } from '../notifications/index.js';

import { ClosureAssessmentService } from './closure-assessment.service.js';
import { DataExportRepository } from './data-export.repository.js';
import { DataExportSchema } from './data-export.schema.js';
import { DataExportService } from './data-export.service.js';
import { ExportBankingService } from './export-banking.service.js';
import { ExportIdentityService } from './export-identity.service.js';
import { KycAnswersReader } from './kyc-answers.reader.js';
import { ProfileChangeNotifier } from './profile-change.notifier.js';
import { ProfileClosureService } from './profile-closure.service.js';
import { CUSTOMER_PROFILE_MODEL, DATA_EXPORT_MODEL } from './profile.constants.js';
import { ProfileController } from './profile.controller.js';
import { ProfileRepository } from './profile.repository.js';
import { CustomerProfileSchema } from './profile.schema.js';
import { ProfileService } from './profile.service.js';

/**
 * The customer's own record, their data, and the end of the relationship.
 *
 * This lane reads widely and writes almost nothing, which is why the import list is long
 * and the export list is empty. Closing a relationship has to see everything the customer
 * holds — accounts, cards, loans, deposits — because a closure that only checked the things
 * this module happened to know about would be a closure with a hole in it. A subject-access
 * copy has to see the same set for the same reason.
 *
 * Every one of those is read through the owning lane's public surface and its own contract
 * mapper. Nothing here reaches into another module's documents, and nothing here writes to
 * another module's collection: an account is closed by `AccountClosureService`, never by a
 * status write from this file.
 *
 * `AuthModule` brings the JWT and CSRF guards, `SessionService` for signing a closed
 * customer out, and the `SecretCipher` that seals this lane's two sealed blobs. `MfaModule`
 * brings `StepUpGuard`, whose instance has to be resolvable inside this module's injector
 * for `@StepUp()` to work on the two consequential routes. `KycModule` supplies the
 * onboarding file the profile is layered over.
 *
 * Nothing is exported. No other lane has any business reading a customer's sealed personal
 * details, and the day one does, the right answer is a narrow port rather than the store.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CUSTOMER_PROFILE_MODEL, schema: CustomerProfileSchema },
      { name: DATA_EXPORT_MODEL, schema: DataExportSchema },
    ]),
    ClockModule,
    AuthModule,
    UsersModule,
    MfaModule,
    AuditModule,
    KycModule,
    AccountsModule,
    CardsModule,
    LoansModule,
    DepositsModule,
    NotificationsModule,
  ],
  controllers: [ProfileController],
  providers: [
    ProfileRepository,
    DataExportRepository,
    KycAnswersReader,
    ProfileService,
    ProfileChangeNotifier,
    ExportIdentityService,
    ExportBankingService,
    DataExportService,
    ClosureAssessmentService,
    ProfileClosureService,
    IdGenerator,
  ],
})
export class ProfileModule {}
