/**
 * Reading and writing the case's sealed personal answers.
 *
 * A service so that no other class ever touches the cipher or the blob's JSON shape:
 * the rest of the lane speaks `KycPii`, and the at-rest encryption stays a detail of
 * this one file's wiring.
 */

import { Injectable } from '@nestjs/common';

import { SecretCipher } from '../auth/support/secret-cipher.js';

import { EMPTY_PII_SEALED, openPii, sealPii, type KycPii } from './kyc-pii.js';

@Injectable()
export class KycPiiStore {
  constructor(private readonly cipher: SecretCipher) {}

  /** A fresh, empty blob for a newly opened case. */
  empty(): string {
    return EMPTY_PII_SEALED;
  }

  /** Opens a stored blob. */
  open(sealed: string): KycPii {
    return openPii(this.cipher, sealed);
  }

  /** Applies one step's answers over the stored blob and reseals. */
  merge(sealed: string, patch: KycPii): string {
    const current = this.open(sealed);
    return sealPii(this.cipher, { ...current, ...patch });
  }
}
