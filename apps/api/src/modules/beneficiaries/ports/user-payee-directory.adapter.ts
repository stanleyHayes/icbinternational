import { Injectable, Logger } from '@nestjs/common';
import { type ClientSession } from 'mongoose';

import { UserRepository } from '../../auth/users/index.js';

import { PayeeDirectoryPort } from './payee-directory.port.js';

/**
 * {@link PayeeDirectoryPort} over the real `users` collection.
 *
 * Email resolution is exact and complete: the address is unique and lower-cased by the
 * schema, so a hit is the customer and a miss is nobody.
 *
 * **Handle resolution answers null, always, and that is deliberate.** The user document
 * has no `handle` field, so there is nothing to look one up in. The alternatives were to
 * derive a handle from the email local part — which would silently assign every customer a
 * public alias they never chose, and route money using it — or to leave the port out and
 * have the transfer path reference a field that does not exist. Answering null makes a
 * `@handle` payment fail with "no such payee", which is true today, and the day the users
 * lane adds the field this method is one query long. `docs/HANDOFFS.md` carries the ask.
 */
@Injectable()
export class UserPayeeDirectoryAdapter extends PayeeDirectoryPort {
  private readonly logger = new Logger(UserPayeeDirectoryAdapter.name);

  constructor(private readonly users: UserRepository) {
    super();
  }

  override async userByEmail(email: string, session?: ClientSession): Promise<string | null> {
    const user = await this.users.findByEmail(email.toLowerCase(), session);
    return user?.id ?? null;
  }

  override async userByHandle(handle: string): Promise<string | null> {
    this.logger.warn(
      `Payment handles are not yet claimable, so ${handle} resolves to nobody. ` +
        'See docs/HANDOFFS.md — the users lane owns the field.',
    );
    return null;
  }

  override async displayNameOf(userId: string, session?: ClientSession): Promise<string | null> {
    const user = await this.users.findById(userId, session);
    if (!user) return null;
    return `${user.firstName} ${user.lastName}`.trim();
  }
}
