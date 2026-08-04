/**
 * The customer's own record: reading it, and changing it.
 *
 * A profile is assembled from two places. The onboarding answers are the base — they are
 * what the bank verified and they are not this lane's to rewrite — and the customer's own
 * corrections sit over them. Reading merges the two; writing only ever touches the
 * corrections. That is what keeps one fact in one place: nothing is copied, so nothing can
 * drift, and a customer moving house does not retroactively alter the file an analyst
 * approved.
 *
 * Ownership is not checked here because there is nothing to check. Every method takes the
 * caller's own id from the verified token and both records are keyed by it; no route on
 * this lane can name another customer.
 */

import { Injectable } from '@nestjs/common';

import { type Profile, type UpdateProfileRequest } from '@reliance/contracts';

import { ClockService } from '../../common/clock/clock.service.js';
import { SecretCipher } from '../auth/support/secret-cipher.js';
import { UsersService } from '../auth/users/index.js';

import { KycAnswersReader, type KycAnswers } from './kyc-answers.reader.js';
import { definedOnly, openDetails, sealDetails, type ProfileDetails } from './profile-details.js';
import { assertUpdatable, changedFields } from './profile-update.rules.js';
import { toContractProfile } from './profile.mapper.js';
import { ProfileRepository } from './profile.repository.js';

/** A profile after a patch, alongside what the patch actually moved. */
export interface ProfileUpdate {
  readonly profile: Profile;
  /** Field names, for the announcement. Empty when the patch changed nothing. */
  readonly changed: readonly string[];
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly onboarding: KycAnswersReader,
    private readonly users: UsersService,
    private readonly cipher: SecretCipher,
    private readonly clock: ClockService,
  ) {}

  /**
   * The signed-in customer's profile.
   *
   * `requireById` is asked first even though nothing below needs the user document: a
   * token can outlive the identity it names, and answering with an empty profile rather
   * than a 404 would be a quietly wrong answer.
   *
   * @throws {AppError} `NOT_FOUND` when the token names a customer who no longer exists.
   */
  async get(userId: string): Promise<Profile> {
    await this.users.requireById(userId);

    const [onboarding, record] = await Promise.all([
      this.onboarding.read(userId),
      this.profiles.findByUser(userId),
    ]);

    return this.assemble(userId, onboarding.answers, record);
  }

  /**
   * Applies a partial change to the customer's details.
   *
   * Partial in the strict sense: only the keys present are touched, and a key the caller
   * left out keeps whatever it had. Absent is not null — treating it as null would let a
   * form that renders three fields blank the other six.
   *
   * @throws {AppError} `KYC_PENDING_REVIEW` or `PRECONDITION_FAILED` — see
   *   `profile-update.rules.ts` for which change earns which.
   */
  async update(userId: string, patch: UpdateProfileRequest): Promise<ProfileUpdate> {
    await this.users.requireById(userId);

    const onboarding = await this.onboarding.read(userId);
    assertUpdatable(patch, onboarding.status);

    const existing = await this.profiles.findByUser(userId);
    const before = this.assemble(userId, onboarding.answers, existing);
    const changed = changedFields(before, patch);
    if (changed.length === 0) return { profile: before, changed };

    const merged = { ...this.corrections(existing?.details), ...definedOnly(patch) };
    const record = await this.profiles.writeDetails(userId, sealDetails(this.cipher, merged));

    return { profile: this.assemble(userId, onboarding.answers, record), changed };
  }

  /** The profile as the contract defines it, merged from both layers. */
  private assemble(
    userId: string,
    answers: KycAnswers['answers'],
    record: StoredProfile | null,
  ): Profile {
    return toContractProfile({
      userId,
      answers,
      corrections: this.corrections(record?.details),
      // A customer who has corrected nothing still needs a timestamp on the wire. The
      // current instant is the honest one: it reads "as at now", not "changed just now".
      updatedAt: record?.updatedAt ?? this.clock.now(),
    });
  }

  private corrections(sealed: string | undefined): ProfileDetails {
    return sealed ? openDetails(this.cipher, sealed) : {};
  }
}

/** What `assemble` needs off a stored record — a hydrated document satisfies it. */
interface StoredProfile {
  readonly details: string;
  readonly updatedAt: Date;
}
