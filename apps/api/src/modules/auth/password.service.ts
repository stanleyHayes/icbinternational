import { Injectable, type OnModuleInit } from '@nestjs/common';
import { argon2id, hash, needsRehash, verify, type HashOptions } from 'argon2';

import { AppConfigService } from '../../config/config.service.js';

import { randomToken } from './support/tokens.js';

/**
 * Password hashing.
 *
 * Argon2id, memory-hard, with the cost parameters supplied by configuration so that they
 * can be raised as hardware gets cheaper without a code change. Every stored digest
 * carries the parameters it was made with, which is what lets {@link needsUpgrade} spot a
 * hash created under the old, weaker settings and silently re-hash it at the next login.
 *
 * Nothing in this file logs, throws with, or returns a password or a digest. An exception
 * carrying either would end up in the log the moment it crossed the exception filter.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  private readonly options: HashOptions;

  /**
   * A real digest of a value nobody knows, used to spend the same CPU on a login for an
   * address that does not exist. See {@link verifyAgainstDecoy}.
   */
  private decoyDigest: string | null = null;

  constructor(config: AppConfigService) {
    const { memoryCost, timeCost, parallelism } = config.passwordHashing;
    this.options = { type: argon2id, memoryCost, timeCost, parallelism };
  }

  /** Computes the decoy once at startup so no request ever pays for it. */
  async onModuleInit(): Promise<void> {
    this.decoyDigest = await this.hash(randomToken());
  }

  /** Hashes a plaintext password. The returned digest embeds salt and parameters. */
  async hash(plaintext: string): Promise<string> {
    return hash(plaintext, this.options);
  }

  /**
   * Checks a password against a stored digest.
   *
   * A malformed or truncated digest makes argon2 throw. That is a data problem, not a
   * wrong password, but the caller can only usefully act on "these credentials failed" —
   * so it is reported as `false` and the digest itself never reaches a log line.
   */
  async verify(digest: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(digest, plaintext);
    } catch {
      return false;
    }
  }

  /**
   * Burns the cost of a verification and always fails.
   *
   * Login must take the same time whether or not the email address exists. Skipping the
   * hash for an unknown address would make "no such user" measurably faster than "wrong
   * password", turning the endpoint into an oracle that lists who banks here.
   */
  async verifyAgainstDecoy(plaintext: string): Promise<false> {
    this.decoyDigest ??= await this.hash(randomToken());
    await this.verify(this.decoyDigest, plaintext);
    return false;
  }

  /** True when a digest was produced with weaker parameters than the current policy. */
  needsUpgrade(digest: string): boolean {
    const { memoryCost, timeCost, parallelism } = this.options;
    return needsRehash(digest, { memoryCost, timeCost, parallelism });
  }
}
