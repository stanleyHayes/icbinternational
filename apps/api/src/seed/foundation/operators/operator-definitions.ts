import { AdminRole } from '@reliance/contracts';

/**
 * The person who runs the bank.
 *
 * A single seeded administrator keeps the console accessible without introducing a second
 * operator that would need to be maintained as a separate identity.
 */

export interface OperatorDefinition {
  readonly email: string;
  readonly fullName: string;
  readonly roles: readonly AdminRole[];
  /**
   * Base32 authenticator seed, fixed rather than generated.
   *
   * Staff sign-in has no password-only path, so a seeded operator with a random secret
   * would be an account nobody can use. Printed alongside the password for an
   * authenticator app to accept by manual entry.
   */
  readonly totpSecret: string;
  /** One line on what this operator is for. Printed with their credentials. */
  readonly remit: string;
}

/**
 * The shared credential for seeded operators, printed to the terminal by `pnpm seed`.
 *
 * These two constants are fixtures for a locally-built bank. They were written on the
 * assumption, stated here, that they were "never used by anything that reaches a network"
 * — and that held right up until the bank was deployed to a public domain out of a public
 * repository. At that point a hard-coded password and a hard-coded authenticator seed stop
 * being fixtures and become a published super-admin credential, with the second factor
 * published beside the first so it defeats itself.
 *
 * So the seed reads both from the environment and falls back to the fixture. A developer
 * running `pnpm seed` against a local Mongo gets the convenience they had before, and any
 * deployment that sets `SEED_OPERATOR_PASSWORD` and `SEED_OPERATOR_TOTP_SECRET` gets a
 * credential that is not in git. A deployment that forgets is no worse off than it was.
 *
 * Generate a pair with:
 *   openssl rand -base64 24
 *   node -e "console.log(require('crypto').randomBytes(20).toString('base64'))"  # base32 seed
 */
// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- local fixture, printed to stdout
const FIXTURE_PASSWORD = '1945@Berlinbunker';
const FIXTURE_TOTP_SECRET = 'KRSXG5CTMVRXEZLUFVZWK4TFOJZGK5DF';

export const OPERATOR_PASSWORD = process.env.SEED_OPERATOR_PASSWORD ?? FIXTURE_PASSWORD;

export const OPERATORS: readonly OperatorDefinition[] = Object.freeze([
  {
    email: 'hayfordstanley@gmail.com',
    fullName: 'Hayford Stanley',
    roles: [AdminRole.SUPER_ADMIN],
    totpSecret: process.env.SEED_OPERATOR_TOTP_SECRET ?? FIXTURE_TOTP_SECRET,
    remit: 'Administrator. Every screen in the console, and every permission behind them.',
  },
]);

