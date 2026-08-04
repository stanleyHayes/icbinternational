import { Injectable } from '@nestjs/common';

import { UserStatus } from '@reliance/contracts';

import { PasswordService } from '../../modules/auth/password.service.js';
import { UserRepository } from '../../modules/auth/users/user.repository.js';
import { UsersService } from '../../modules/auth/users/users.service.js';

import { PERSONA_PASSWORD, type Persona } from './persona-definitions.js';

/**
 * Creates the customer record behind a persona.
 *
 * Separated from the history generator because they answer different questions — who this
 * person is, versus what they have done — and because putting both in one service meant it
 * needed seven collaborators, which is the usual sign that a class is really two.
 */
@Injectable()
export class CustomerFactoryService {
  constructor(
    private readonly users: UsersService,
    private readonly repository: UserRepository,
    private readonly passwords: PasswordService,
  ) {}

  /** Registers the customer and puts them at the tier their persona calls for. */
  async create(persona: Persona): Promise<string> {
    const user = await this.users.createCustomer({
      email: persona.email,
      passwordHash: await this.passwords.hash(PERSONA_PASSWORD),
      firstName: persona.firstName,
      lastName: persona.lastName,
      phone: persona.phone,
      segment: persona.segment,
      locale: 'en-GB',
      baseCurrency: 'GBP',
      marketingOptIn: false,
    });

    // Tier and verification are set directly rather than driven through the KYC flow. That
    // flow is worth walking once by hand — the unverified persona exists so it can be —
    // but replaying it for every generated customer would test the seeder, not the product.
    const verified = persona.kycTier > 0;
    await this.repository.patch(user.id, {
      $set: {
        emailVerified: verified,
        status: verified ? UserStatus.ACTIVE : UserStatus.PENDING_VERIFICATION,
        kycTier: persona.kycTier,
      },
    });

    return user.id;
  }
}
