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

export const OPERATORS: readonly OperatorDefinition[] = Object.freeze([
  {
    email: 'hayfordstanley@gmail.com',
    fullName: 'Hayford Stanley',
    roles: [AdminRole.SUPER_ADMIN],
    totpSecret: 'KRSXG5CTMVRXEZLUFVZWK4TFOJZGK5DF',
    remit: 'Administrator. Every screen in the console, and every permission behind them.',
  },
]);

/**
 * The shared credential for seeded operators, printed to the terminal by `pnpm seed`.
 *
 * A fixture for a locally-built bank — long, obviously invented, and never used by
 * anything that reaches a network.
 */
// eslint-disable-next-line sonarjs/no-hardcoded-passwords -- local fixture, printed to stdout
export const OPERATOR_PASSWORD = '1945@Berlinbunker';
