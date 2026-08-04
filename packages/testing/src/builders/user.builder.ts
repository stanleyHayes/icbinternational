/**
 * Fluent builder for the contract `User`.
 *
 * Person-like defaults come from a dedicated seeded faker, drawn lazily at `build()`
 * time: the first build of a fresh builder is identical on every run, and
 * `buildMany` advances the stream so each user is a different (still deterministic)
 * person.
 */

import { CustomerSegment, MfaMethod, UserStatus, userSchema, type User } from '@reliance/contracts';
import type { CurrencyCode } from '@reliance/money';

import { createSeededFaker } from '../faker/seeded-faker.js';

import { Builder, DEFAULT_INSTANT } from './builder.js';
import { testId } from './test-id.js';

/** Builds contract-valid {@link User} objects. */
export class UserBuilder extends Builder<User> {
  private readonly faker = createSeededFaker();
  private idOverride: string | null = null;
  private emailOverride: string | null = null;
  private firstNameOverride: string | null = null;
  private lastNameOverride: string | null = null;
  private status: UserStatus = UserStatus.ACTIVE;
  private segment: CustomerSegment = CustomerSegment.PERSONAL;
  private baseCurrency: CurrencyCode = 'GBP';

  withId(id: string): this {
    this.idOverride = id;
    return this;
  }

  withEmail(email: string): this {
    this.emailOverride = email;
    return this;
  }

  /** Sets both name parts at once; most tests need a name, not a first and a last. */
  withName(firstName: string, lastName: string): this {
    this.firstNameOverride = firstName;
    this.lastNameOverride = lastName;
    return this;
  }

  withStatus(status: UserStatus): this {
    this.status = status;
    return this;
  }

  withSegment(segment: CustomerSegment): this {
    this.segment = segment;
    return this;
  }

  withBaseCurrency(currency: CurrencyCode): this {
    this.baseCurrency = currency;
    return this;
  }

  build(): User {
    return userSchema.parse({
      id: this.idOverride ?? testId('usr'),
      email: this.emailOverride ?? this.faker.internet.email().toLowerCase(),
      emailVerified: this.status !== UserStatus.PENDING_VERIFICATION,
      phone: null,
      phoneVerified: false,
      firstName: this.firstNameOverride ?? this.faker.person.firstName(),
      lastName: this.lastNameOverride ?? this.faker.person.lastName(),
      status: this.status,
      segment: this.segment,
      kycTier: 1,
      mfaEnabled: false,
      mfaMethods: [MfaMethod.RECOVERY_CODE],
      locale: 'en-GB',
      baseCurrency: this.baseCurrency,
      avatarUrl: null,
      createdAt: DEFAULT_INSTANT,
      lastLoginAt: null,
    });
  }
}

/** Entry point: `aUser().withEmail('ada@example.com').build()`. */
export function aUser(): UserBuilder {
  return new UserBuilder();
}
