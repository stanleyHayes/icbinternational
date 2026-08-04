import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../../config/config.service.js';

const ALGORITHM = 'aes-256-gcm';
/** 96 bits is the nonce size AES-GCM is specified and optimised for. */
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const PART_SEPARATOR = '.';
const EXPECTED_PARTS = 3;

/**
 * Reversible encryption for secrets the server must be able to read back.
 *
 * A TOTP secret cannot be hashed: verifying a code requires recomputing HMACs from the
 * original bytes. Encryption is therefore the strongest available protection, and it buys
 * something real — a stolen database backup alone does not let the thief generate valid
 * codes, because the key lives in the environment and not in the dump.
 *
 * GCM rather than CBC because it authenticates as well as encrypts: a tampered ciphertext
 * fails to open instead of decrypting to attacker-chosen bytes.
 */
@Injectable()
export class SecretCipher {
  /** AES-256 needs exactly 32 bytes; SHA-256 of the configured key is the standard fold. */
  private readonly key: Buffer;

  constructor(config: AppConfigService) {
    this.key = createHash('sha256').update(config.encryptionKey, 'utf8').digest();
  }

  /**
   * Encrypts a secret to `iv.tag.ciphertext`, all base64url.
   *
   * A fresh random IV per call is not optional: reusing one under the same key in GCM
   * leaks the XOR of the two plaintexts and destroys the authentication guarantee.
   */
  seal(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [iv, cipher.getAuthTag(), ciphertext]
      .map((part) => part.toString('base64url'))
      .join(PART_SEPARATOR);
  }

  /**
   * Decrypts a value produced by {@link seal}.
   *
   * @throws {Error} if the ciphertext, tag or key does not match. The caller treats that as
   *   "this secret is unusable", never as "the code was wrong" — the two have very
   *   different remedies.
   */
  open(sealed: string): string {
    const parts = sealed.split(PART_SEPARATOR);
    if (parts.length !== EXPECTED_PARTS) {
      throw new Error('Malformed sealed secret: expected iv.tag.ciphertext');
    }

    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'));
    if (!iv || !tag || !ciphertext || iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
      throw new Error('Malformed sealed secret: wrong iv or tag length');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
