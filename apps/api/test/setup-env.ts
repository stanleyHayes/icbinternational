/**
 * Test environment defaults, applied before any test module loads.
 *
 * `AppConfigModule` validates the whole environment with Zod at construction and refuses
 * to boot on a missing variable — deliberately, because a bank that starts without a
 * signing secret is worse than one that does not start. That makes every integration test
 * that touches the config module dependent on the environment being complete.
 *
 * Each test file used to set its own subset, which held only while the module graph stayed
 * the same shape. Adding `RbacModule` to `ProductsModule` — one line, to satisfy a guard
 * the products controller already used — pulled `AppConfigModule` into three test graphs
 * that had never needed the auth secrets, and all three failed on variables unrelated to
 * anything they assert.
 *
 * Setting them centrally makes the environment a property of "running the API's tests"
 * rather than something each file rediscovers. Every assignment uses `??=`, so a file that
 * needs a specific value — a dedicated database, a lowered Argon2 cost — still sets it and
 * wins.
 *
 * These are test values. They are not secrets, and nothing outside a test reads them.
 */

/** Host ports match `infra/docker-compose.yml`, chosen not to collide with local stacks. */
const MONGO = 'mongodb://127.0.0.1:27317/reliancebank_test?replicaSet=rs0';

process.env.NODE_ENV ??= 'test';
process.env.MONGODB_URI ??= MONGO;
process.env.MONGODB_DB ??= 'reliancebank_test';

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-with-enough-length-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-with-enough-length-9876543210';
process.env.CSRF_SECRET ??= 'test-csrf-secret-0123456789abcdef';
// AES-256-GCM wants 32 bytes.
process.env.ENCRYPTION_KEY ??= 'test-encryption-key-0123456789ab';

// Argon2 at production cost makes a suite that logs in unusable — the OWASP settings are
// tuned to be slow. Verification strength is not what these tests are asserting.
process.env.ARGON2_MEMORY_KIB ??= '1024';
process.env.ARGON2_TIME_COST ??= '1';
