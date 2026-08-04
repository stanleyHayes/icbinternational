import { Module } from '@nestjs/common';

import { AuthCookiesService } from '../auth/auth-cookies.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DevicesModule } from '../devices/devices.module.js';

import { FactorVerificationService } from './factor-verification.service.js';
import { MfaChallengeController } from './mfa-challenge.controller.js';
import { MfaChallengeService } from './mfa-challenge.service.js';
import { MfaService } from './mfa.service.js';
import { PasskeyStoreService } from './passkey-store.service.js';
import { PasskeyController } from './passkey.controller.js';
import { PasskeyService } from './passkey.service.js';
import { RecoveryCodeService } from './recovery-code.service.js';
import { StepUpController } from './step-up.controller.js';
import { StepUpGuard } from './step-up.guard.js';
import { StepUpService } from './step-up.service.js';
import { TotpController } from './totp.controller.js';
import { TotpService } from './totp.service.js';
import { WebAuthnChallengeService } from './webauthn-challenge.service.js';

/**
 * Multi-factor authentication: TOTP enrolment, recovery codes, WebAuthn passkeys, the
 * login challenge's second half, and the step-up proof sensitive endpoints require.
 *
 * Serves routes under both `/mfa/*` and two `/auth/*` paths the contract assigns to this
 * work (`/auth/mfa/verify`, `/auth/step-up`); the paths say nothing about ownership.
 *
 * `AuthCookiesService` is provided locally rather than exported by the auth module: it is
 * a thin cookie writer over already-exported collaborators, and widening the auth
 * module's surface to share it would couple every consumer to cookie policy they do not
 * need.
 *
 * Exports are the module's real surface: `StepUpGuard` (with the `@StepUp()` decorator,
 * a pure function imported from its file) for every 🔐 route in the system, and
 * `FactorVerificationService` for flows like fraud challenges that must re-check a
 * factor outside login.
 */
@Module({
  imports: [AuthModule, DevicesModule],
  controllers: [TotpController, StepUpController, MfaChallengeController, PasskeyController],
  providers: [
    AuthCookiesService,
    TotpService,
    RecoveryCodeService,
    MfaService,
    FactorVerificationService,
    MfaChallengeService,
    StepUpService,
    StepUpGuard,
    WebAuthnChallengeService,
    PasskeyStoreService,
    PasskeyService,
  ],
  exports: [StepUpGuard, FactorVerificationService, StepUpService, PasskeyService],
})
export class MfaModule {}
