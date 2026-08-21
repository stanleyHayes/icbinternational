import { Inject, Injectable } from '@nestjs/common';

import { type CurrencyCode } from '@reliance/money';

import { ENVIRONMENT } from './config.tokens.js';
import { supportedCurrencies, type Environment } from './configuration.js';

/**
 * Typed accessor for configuration.
 *
 * Grouped getters rather than a flat bag: a service that needs cookie settings asks for
 * `config.cookies`, and cannot accidentally read a JWT secret it has no business seeing.
 */
@Injectable()
export class AppConfigService {
  constructor(@Inject(ENVIRONMENT) private readonly env: Environment) {}

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  get nodeEnv(): Environment['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  get port(): number {
    return this.env.PORT;
  }

  get logLevel(): Environment['LOG_LEVEL'] {
    return this.env.LOG_LEVEL;
  }

  /**
   * How the process sits on the network.
   *
   * `trustProxy` is handed to Express verbatim. It decides whether `request.ip` comes from
   * `X-Forwarded-For` or from the socket, which is why anything that keys off the caller's
   * address — rate limiting above all — depends on it being wrong-by-default-safe.
   */
  get network() {
    return { trustProxy: this.env.TRUST_PROXY } as const;
  }

  /** Origins permitted by CORS. The three front ends and nothing else. */
  get allowedOrigins(): string[] {
    return [this.env.WEB_MARKETING_URL, this.env.WEB_CLIENT_URL, this.env.WEB_ADMIN_URL];
  }

  get database() {
    return { uri: this.env.MONGODB_URI, name: this.env.MONGODB_DB } as const;
  }


  get jwt() {
    return {
      accessSecret: this.env.JWT_ACCESS_SECRET,
      refreshSecret: this.env.JWT_REFRESH_SECRET,
      accessTtl: this.env.JWT_ACCESS_TTL,
      refreshTtl: this.env.JWT_REFRESH_TTL,
      stepUpTtl: this.env.STEP_UP_TTL,
    } as const;
  }

  get cookies() {
    return {
      domain: this.env.COOKIE_DOMAIN,
      secure: this.env.COOKIE_SECURE,
      csrfSecret: this.env.CSRF_SECRET,
    } as const;
  }

  get passwordHashing() {
    return {
      memoryCost: this.env.ARGON2_MEMORY_KIB,
      timeCost: this.env.ARGON2_TIME_COST,
      parallelism: this.env.ARGON2_PARALLELISM,
    } as const;
  }

  get encryptionKey(): string {
    return this.env.ENCRYPTION_KEY;
  }

  get email() {
    return {
      apiKey: this.env.RESEND_API_KEY,
      webhookSecret: this.env.RESEND_WEBHOOK_SECRET,
      from: this.env.MAIL_FROM,
      replyTo: this.env.MAIL_REPLY_TO,
      /** With no API key configured, emails are rendered to the log instead of sent. */
      enabled: this.env.RESEND_API_KEY.length > 0,
    } as const;
  }

  get media() {
    return {
      cloudName: this.env.CLOUDINARY_CLOUD_NAME,
      apiKey: this.env.CLOUDINARY_API_KEY,
      apiSecret: this.env.CLOUDINARY_API_SECRET,
      folder: this.env.CLOUDINARY_UPLOAD_FOLDER,
      signedUrlTtlSeconds: this.env.CLOUDINARY_SIGNED_URL_TTL,
      enabled: this.env.CLOUDINARY_CLOUD_NAME.length > 0,
    } as const;
  }

  get webPush() {
    return {
      publicKey: this.env.VAPID_PUBLIC_KEY,
      privateKey: this.env.VAPID_PRIVATE_KEY,
      subject: this.env.VAPID_SUBJECT,
      enabled: this.env.VAPID_PUBLIC_KEY.length > 0,
    } as const;
  }

  get bank() {
    return {
      name: this.env.BANK_NAME,
      code: this.env.BANK_CODE,
      bic: this.env.BANK_BIC,
      country: this.env.BANK_COUNTRY,
      sortCode: this.env.BANK_SORT_CODE,
      baseCurrency: this.env.BASE_CURRENCY as CurrencyCode,
      currencies: supportedCurrencies(this.env),
    } as const;
  }

  get simulation() {
    return {
      clockEnabled: this.env.SIM_CLOCK_ENABLED,
      seed: this.env.SIM_SEED,
      railFailureBps: this.env.SIM_RAIL_FAILURE_BPS,
      latencyMinMs: this.env.SIM_RAIL_LATENCY_MIN_MS,
      latencyMaxMs: this.env.SIM_RAIL_LATENCY_MAX_MS,
    } as const;
  }

  get features() {
    return {
      businessBanking: this.env.FEATURE_BUSINESS_BANKING,
      investments: this.env.FEATURE_INVESTMENTS,
      passkeys: this.env.FEATURE_PASSKEYS,
    } as const;
  }

  get rateLimit() {
    return {
      windowSeconds: this.env.RATE_LIMIT_WINDOW_SECONDS,
      maxRequests: this.env.RATE_LIMIT_MAX_REQUESTS,
      loginMaxAttempts: this.env.LOGIN_MAX_ATTEMPTS,
      loginLockoutMinutes: this.env.LOGIN_LOCKOUT_MINUTES,
    } as const;
  }
}
