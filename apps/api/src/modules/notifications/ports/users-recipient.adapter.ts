import { Injectable } from '@nestjs/common';

import { UsersService } from '../../auth/users/index.js';

import { RecipientPort, type Recipient } from './recipient.port.js';

/**
 * Resolves a recipient from the customer record.
 *
 * An unverified address comes back as `null` rather than as itself. Sending to an
 * unverified address is how a typo during registration becomes a stranger receiving
 * somebody's balance, and how an attacker who changes an address mid-session receives the
 * security notice warning about the change.
 */
@Injectable()
export class UsersRecipientAdapter extends RecipientPort {
  constructor(private readonly users: UsersService) {
    super();
  }

  override async find(userId: string): Promise<Recipient | null> {
    const user = await this.users.requireById(userId).catch(() => null);
    if (!user) return null;

    return {
      userId: user.id,
      displayName: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      emailAddress: user.emailVerified ? user.email : null,
      phoneNumber: user.phoneVerified ? user.phone : null,
      locale: user.locale,
    };
  }
}
