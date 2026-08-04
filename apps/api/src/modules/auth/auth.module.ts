import { Module, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { DevicesModule } from '../devices/devices.module.js';

import { AuthCookiesService } from './auth-cookies.service.js';
import { AuthPasswordController } from './auth-password.controller.js';
import { AuthTokenRepository } from './auth-token.repository.js';
import { AuthController } from './auth.controller.js';
import { CsrfService } from './csrf.service.js';
import { EmailTokenService } from './email-token.service.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { LoginPolicy } from './login-policy.service.js';
import { LoginService } from './login.service.js';
import { OneTimeTokenService } from './one-time-token.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { PasswordService } from './password.service.js';
import { AUTH_EMAIL_PORT } from './ports/auth-email.port.js';
import { LoggingAuthEmailAdapter } from './ports/logging-auth-email.adapter.js';
import { RegistrationService } from './registration.service.js';
import { AuthToken, AuthTokenSchema } from './schemas/auth-token.schema.js';
import { Session, SessionSchema } from './schemas/session.schema.js';
import { SessionRepository } from './session.repository.js';
import { SessionService } from './session.service.js';
import { SecretCipher } from './support/secret-cipher.js';
import { TokenService } from './token.service.js';
import { UsersModule } from './users/index.js';

/**
 * Customer authentication: registration, email verification, login, rotating sessions,
 * password management, and the guards every other module builds on.
 *
 * Email is a port with a logging adapter (ADR-004); the notifications workstream swaps in
 * the Resend-backed implementation by rebinding `AUTH_EMAIL_PORT`.
 *
 * The exports are the module's real surface: `JwtAuthGuard` and `CsrfGuard` for every
 * 🔒 route in the system, `TokenService` for the step-up and MFA tokens A-05 adds, and
 * `SecretCipher` for the TOTP secrets it will store.
 */
@Module({
  imports: [
    UsersModule,
    forwardRef(() => DevicesModule),
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: AuthToken.name, schema: AuthTokenSchema },
    ]),
  ],
  controllers: [AuthController, AuthPasswordController],
  providers: [
    { provide: JwtService, useFactory: () => new JwtService() },
    { provide: AUTH_EMAIL_PORT, useClass: LoggingAuthEmailAdapter },
    IdGenerator,
    PasswordService,
    TokenService,
    SecretCipher,
    SessionRepository,
    SessionService,
    AuthTokenRepository,
    OneTimeTokenService,
    EmailTokenService,
    LoginPolicy,
    RegistrationService,
    LoginService,
    PasswordResetService,
    CsrfService,
    AuthCookiesService,
    JwtAuthGuard,
    CsrfGuard,
  ],
  exports: [
    TokenService,
    SessionService,
    PasswordService,
    SecretCipher,
    CsrfService,
    JwtAuthGuard,
    CsrfGuard,
    UsersModule,
  ],
})
export class AuthModule {}
