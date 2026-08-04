import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENVIRONMENT } from '../../../config/config.module.js';
import { type Environment } from '../../../config/configuration.js';

import { type AuthEmail, type AuthEmailPort } from './auth-email.port.js';

const VERIFICATION_PATH = 'verify-email';
// A URL path segment, not a credential.
// eslint-disable-next-line sonarjs/no-hardcoded-passwords
const PASSWORD_RESET_PATH = 'reset-password';

/**
 * Development stand-in for the email provider.
 *
 * ADR-004: with no Resend key configured the API degrades to logging. The full link —
 * token included — is logged deliberately: in a dev or test environment that log line is
 * the only way to complete the flow, and the token is a secret only where real email
 * exists to carry it.
 */
@Injectable()
export class LoggingAuthEmailAdapter implements AuthEmailPort {
  private readonly logger = new Logger(LoggingAuthEmailAdapter.name);

  constructor(@Inject(ENVIRONMENT) private readonly env: Environment) {}

  async sendVerificationEmail(message: AuthEmail): Promise<void> {
    this.logger.log(this.line('verification', message, VERIFICATION_PATH));
  }

  async sendPasswordResetEmail(message: AuthEmail): Promise<void> {
    this.logger.log(this.line('password-reset', message, PASSWORD_RESET_PATH));
  }

  private line(kind: string, message: AuthEmail, path: string): string {
    const link = `${this.env.WEB_CLIENT_URL}/${path}?token=${message.token}`;
    return `[email:${kind}] to=${message.to} link=${link}`;
  }
}
