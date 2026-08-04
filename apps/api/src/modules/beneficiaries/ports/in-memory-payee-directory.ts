import { Injectable } from '@nestjs/common';

import { PayeeDirectoryPort } from './payee-directory.port.js';

/** One customer's public identifiers, as the directory knows them. */
export interface DirectoryEntry {
  readonly userId: string;
  readonly email: string;
  /** Including the leading `@`, matching `internalDestinationSchema`. */
  readonly handle?: string;
  readonly displayName: string;
}

/**
 * An in-memory {@link PayeeDirectoryPort} for tests, the seed and the simulator.
 *
 * Honest in the one way that matters: an identifier nobody registered resolves to nobody,
 * and it says so rather than inventing a plausible id. A fake that answered every lookup
 * would hide exactly the failure the port exists to surface — money routed to the wrong
 * customer because a lookup was assumed to succeed.
 *
 * Unlike the Mongo adapter this one *can* resolve handles, so the `@handle` transfer path
 * is genuinely exercised by the suite and is proven working the moment the users lane adds
 * the field the real adapter needs.
 */
@Injectable()
export class InMemoryPayeeDirectory extends PayeeDirectoryPort {
  private readonly byUserId = new Map<string, DirectoryEntry>();

  /** Registers a customer's public identifiers. Mirrors "a customer signs up". */
  register(entry: DirectoryEntry): this {
    this.byUserId.set(entry.userId, entry);
    return this;
  }

  override async userByEmail(email: string): Promise<string | null> {
    return this.find((entry) => entry.email.toLowerCase() === email.toLowerCase());
  }

  override async userByHandle(handle: string): Promise<string | null> {
    return this.find((entry) => entry.handle?.toLowerCase() === handle.toLowerCase());
  }

  override async displayNameOf(userId: string): Promise<string | null> {
    return this.byUserId.get(userId)?.displayName ?? null;
  }

  private find(predicate: (entry: DirectoryEntry) => boolean): string | null {
    return [...this.byUserId.values()].find(predicate)?.userId ?? null;
  }
}
