/**
 * Environment configuration, validated at boot.
 *
 * The schema is the specification. A missing secret or a Mongo URI without a replica set
 * aborts startup with a readable message, rather than surfacing three hours later as a
 * failed transaction in production. Nothing in the app reads `process.env` directly —
 * everything goes through the typed config this module produces.
 */

import { z } from 'zod';

import { CURRENCY_CODES, type CurrencyCode } from '@reliance/money';

const DEFAULT_PORT = 4400;

/** Comma-separated list → trimmed array. Used for currencies and allowlists. */
const csv = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    );

const booleanFromEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? fallback : value === 'true' || value === '1'));

const intFromEnv = (fallback: number) => z.coerce.number().int().default(fallback);

/**
 * Express's `trust proxy` setting, read from an env string.
 *
 * The default is to trust **nothing**. Express then derives `request.ip` from the socket,
 * so a caller cannot mint themselves a fresh rate-limit budget by rotating
 * `X-Forwarded-For`. An operator running behind a load balancer opts in explicitly:
 * `true` (trust every hop), a hop count (`1`), or anything Express accepts as a trusted
 * address list (`loopback`, `10.0.0.0/8`, a comma-separated set).
 */
export type TrustProxySetting = boolean | number | string;

const trustProxySchema = z
  .string()
  .default('false')
  // The union is Express's own contract for `trust proxy`, not indecision on our part:
  // boolean, hop count and address list mean three different things to it.
  // eslint-disable-next-line sonarjs/function-return-type -- mirrors Express's API
  .transform((value): TrustProxySetting => {
    const setting = value.trim();
    if (setting === '' || setting === 'false') return false;
    if (setting === 'true') return true;

    // A bare integer is a hop count; anything else is left for Express to interpret as
    // an address, subnet or preset name, so new Express syntax needs no change here.
    const hops = Number(setting);
    return Number.isInteger(hops) && hops >= 0 ? hops : setting;
  });

/**
 * Mongo without a replica set silently disables multi-document transactions, which would
 * make every "atomic" ledger write a lie. Refuse to start rather than allow that.
 */
const mongoUriSchema = z
  .string()
  .startsWith('mongodb', 'must be a MongoDB connection string')
  .refine((uri) => uri.includes('replicaSet='), {
    message:
      'MONGODB_URI must target a replica set (add ?replicaSet=rs0). Multi-document transactions ' +
      'are unavailable on a standalone server, and the ledger requires them.',
  });

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  PORT: intFromEnv(DEFAULT_PORT),
  TRUST_PROXY: trustProxySchema,
  API_URL: z.url().default('http://localhost:4400'),
  WEB_MARKETING_URL: z.url().default('http://localhost:3000'),
  WEB_CLIENT_URL: z.url().default('http://localhost:3001'),
  WEB_ADMIN_URL: z.url().default('http://localhost:3002'),

  MONGODB_URI: mongoUriSchema,
  MONGODB_DB: z.string().min(1).default('reliancebank'),
  REDIS_URL: z.string().startsWith('redis'),

  JWT_ACCESS_SECRET: z.string().min(32, 'needs at least 32 characters of entropy'),
  JWT_REFRESH_SECRET: z.string().min(32, 'needs at least 32 characters of entropy'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  STEP_UP_TTL: z.string().default('5m'),

  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: booleanFromEnv(false),
  CSRF_SECRET: z.string().min(16),

  ARGON2_MEMORY_KIB: intFromEnv(19_456),
  ARGON2_TIME_COST: intFromEnv(2),
  ARGON2_PARALLELISM: intFromEnv(1),
  ENCRYPTION_KEY: z.string().min(32),

  RESEND_API_KEY: z.string().default(''),
  RESEND_WEBHOOK_SECRET: z.string().default(''),
  MAIL_FROM: z.string().default('Reliance Bank <no-reply@reliancebank.example>'),
  MAIL_REPLY_TO: z.string().default('support@reliancebank.example'),

  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default('reliancebank/dev'),
  CLOUDINARY_SIGNED_URL_TTL: intFromEnv(300),

  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:support@reliancebank.example'),

  BANK_NAME: z.string().default('Reliance Bank'),
  BANK_CODE: z.string().length(4).default('RLNC'),
  BANK_BIC: z.string().min(8).default('RLNCGB2LXXX'),
  BANK_COUNTRY: z.string().length(2).default('GB'),
  BANK_SORT_CODE: z
    .string()
    .regex(/^\d{6}$/)
    .default('049921'),
  BASE_CURRENCY: z.enum(CURRENCY_CODES).default('GBP'),
  SUPPORTED_CURRENCIES: csv('GBP,USD,EUR'),

  SIM_CLOCK_ENABLED: booleanFromEnv(true),
  SIM_SEED: z.string().default('reliance'),
  SIM_RAIL_FAILURE_BPS: intFromEnv(300),
  SIM_RAIL_LATENCY_MIN_MS: intFromEnv(250),
  SIM_RAIL_LATENCY_MAX_MS: intFromEnv(2500),

  FEATURE_BUSINESS_BANKING: booleanFromEnv(true),
  FEATURE_INVESTMENTS: booleanFromEnv(false),
  FEATURE_PASSKEYS: booleanFromEnv(true),

  RATE_LIMIT_WINDOW_SECONDS: intFromEnv(60),
  RATE_LIMIT_MAX_REQUESTS: intFromEnv(120),
  LOGIN_MAX_ATTEMPTS: intFromEnv(5),
  LOGIN_LOCKOUT_MINUTES: intFromEnv(15),

  SENTRY_DSN: z.string().default(''),
  METRICS_ENABLED: booleanFromEnv(true),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * Parses `process.env`, failing loudly and legibly.
 *
 * @throws {Error} listing every invalid variable at once — fixing them one boot at a
 *   time is a waste of everyone's afternoon.
 */
export function loadEnvironment(source: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${problems}\n`);
}

/** Narrows the configured currency list to supported codes, dropping anything unknown. */
export function supportedCurrencies(environment: Environment): CurrencyCode[] {
  const known = new Set<string>(CURRENCY_CODES);
  return environment.SUPPORTED_CURRENCIES.filter((code): code is CurrencyCode => known.has(code));
}
