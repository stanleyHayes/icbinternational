/**
 * Shared fixtures for the auth module's tests.
 *
 * `applyTestEnvironment` points configuration at the local replica set and the cheapest
 * Argon2 parameters that still exercise the real algorithm — the suite proves behaviour,
 * not that hashing is slow. Every test file uses its own database name so Jest workers
 * never share collections.
 */

import { loadEnvironment, type Environment } from '../../../config/configuration.js';

export const TEST_MONGO_URI = 'mongodb://127.0.0.1:27317/?replicaSet=rs0';

/** Values the environment schema refuses to start without. */
const REQUIRED_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  MONGODB_URI: TEST_MONGO_URI,
  REDIS_URL: 'redis://127.0.0.1:6579',
  JWT_ACCESS_SECRET: 'test-access-secret-with-32-bytes-minimum',
  JWT_REFRESH_SECRET: 'test-refresh-secret-with-32-bytes-minimum',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
  CSRF_SECRET: 'test-csrf-secret-0123456789',
  ENCRYPTION_KEY: 'test-encryption-key-0123456789ab',
  ARGON2_MEMORY_KIB: '1024',
  ARGON2_TIME_COST: '1',
  ARGON2_PARALLELISM: '1',
  LOGIN_MAX_ATTEMPTS: '3',
  LOGIN_LOCKOUT_MINUTES: '10',
};

/**
 * Populates `process.env` for a Nest test module. Must run before the module is compiled:
 * the config factory reads the environment once, at module init.
 */
export function applyTestEnvironment(
  dbName: string,
  overrides: Record<string, string> = {},
): { uri: string; dbName: string } {
  for (const [key, value] of Object.entries({ ...REQUIRED_ENV, ...overrides })) {
    process.env[key] = value;
  }
  process.env.MONGODB_DB = dbName;
  return { uri: TEST_MONGO_URI, dbName };
}

/** A validated config object for constructing services directly, without Nest. */
export function testConfig(): Environment {
  return loadEnvironment({ ...REQUIRED_ENV, MONGODB_DB: 'auth_test_unit' });
}

/** Registration payload that satisfies the contract schema. */
export function registrationOf(email: string): Record<string, unknown> {
  return {
    email,
    // A fixture credential for throwaway test accounts, never a real one.
    // eslint-disable-next-line sonarjs/no-hardcoded-passwords
    password: 'Sup3r-Secret-Passphrase',
    firstName: 'Ada',
    lastName: 'Lovelace',
    acceptedTerms: true,
    marketingOptIn: false,
  };
}

/** Login payload for the same contract. */
export function loginOf(email: string, password: string): Record<string, unknown> {
  return { email, password, deviceFingerprint: 'fp-test-1234567890', rememberDevice: false };
}
