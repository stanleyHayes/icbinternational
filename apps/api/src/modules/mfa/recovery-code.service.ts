import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { sha256Hex } from '../auth/support/tokens.js';

/** Ten is the industry norm: enough to survive a lost phone, few enough to keep somewhere safe. */
export const RECOVERY_CODE_COUNT = 10;

/**
 * Crockford base32 without `I`, `L`, `O` and `U`.
 *
 * Someone reads these off paper under stress. Removing the characters that are misread as
 * one another eliminates most support calls about a code that "does not work".
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const GROUP_LENGTH = 5;
const GROUPS_PER_CODE = 2;
const CODE_LENGTH = GROUP_LENGTH * GROUPS_PER_CODE;
const GROUP_SEPARATOR = '-';

/** A freshly generated set: the codes to show once, and the hashes to store. */
export interface RecoveryCodeSet {
  codes: string[];
  hashes: string[];
}

/**
 * Single-use codes for the day the authenticator is gone.
 *
 * Stored as SHA-256, not Argon2. That is the correct choice *here* and would be wrong for
 * a password: these codes are fifty bits of machine-generated entropy with no dictionary
 * behind them, so a fast hash costs an attacker nothing they did not already have, and it
 * buys a constant-time lookup instead of ten sequential memory-hard verifications on a
 * path a locked-out customer is already anxious about.
 *
 * A code is consumed by deleting its hash, so redemption is atomic and unrepeatable: the
 * `$pull` either removes it or it does not.
 */
@Injectable()
export class RecoveryCodeService {
  /** Generates a fresh set. The plaintext exists only in the returned value. */
  generate(): RecoveryCodeSet {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => this.mintCode());
    return { codes, hashes: codes.map((code) => sha256Hex(normalise(code))) };
  }

  /**
   * The hash to look for when redeeming a code.
   *
   * Normalising first means a customer who types their code in lower case, or without the
   * dash, is not refused for a formatting mistake.
   */
  hashOf(code: string): string {
    return sha256Hex(normalise(code));
  }

  /** True when the presented code is one of the unspent hashes. */
  matches(code: string, storedHashes: readonly string[]): boolean {
    return storedHashes.includes(this.hashOf(code));
  }

  private mintCode(): string {
    // One byte per character, taken modulo 32. A byte is uniform over 256 values and
    // 256 is an exact multiple of 32, so this introduces no bias.
    const characters = [...randomBytes(CODE_LENGTH)].map(
      (byte) => ALPHABET[byte % ALPHABET.length],
    );

    return [
      characters.slice(0, GROUP_LENGTH).join(''),
      characters.slice(GROUP_LENGTH).join(''),
    ].join(GROUP_SEPARATOR);
  }
}

/** Upper-cases and strips the display separator and any stray whitespace. */
function normalise(code: string): string {
  return code.toUpperCase().replaceAll(/[\s-]/g, '');
}
